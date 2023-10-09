/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
process.env.FORCE_FOLLOW_REMOTE_USER_FOR_TESTING = 'true';

import * as assert from 'assert';
import { signup, api, post, react, startServer, waitFire, sleep, uploadUrl, randomString } from '../utils.js';
import type { INestApplicationContext } from '@nestjs/common';
import type * as misskey from 'misskey-js';

function genHost() {
	return randomString() + '.example.com';
}

function waitForPushToTl() {
	return sleep(300);
}

let app: INestApplicationContext;

beforeAll(async () => {
	app = await startServer();
}, 1000 * 60 * 2);

afterAll(async () => {
	await app.close();
});

describe('Timelines', () => {
	describe('Home TL', () => {
		test.concurrent('自分の visibility: followers なノートが含まれる', async () => {
			const [alice] = await Promise.all([signup()]);

			const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === aliceNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === aliceNote.id).text, 'hi');
		});

		test.concurrent('フォローしているユーザーのノートが含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi' });
			const carolNote = await post(carol, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('フォローしているユーザーの visibility: followers なノートが含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });
			const carolNote = await post(carol, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === bobNote.id).text, 'hi');
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: false でフォローしているユーザーの他人への返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: true でフォローしているユーザーの他人への返信が含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: true でフォローしているユーザーの他人へのDM返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id, visibility: 'specified', visibleUserIds: [carolNote.id] });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: true でフォローしているユーザーの他人の visibility: followers な投稿への返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi', visibility: 'followers' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: true でフォローしているユーザーの行った別のフォローしているユーザーの visibility: followers な投稿への返信が含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/create', { userId: carol.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi', visibility: 'followers' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === carolNote.id).text, 'hi');
		});

		test.concurrent('withReplies: true でフォローしているユーザーの行った別のフォローしているユーザーの投稿への visibility: specified な返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/create', { userId: carol.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id, visibility: 'specified', visibleUserIds: [carolNote.id] });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), true);
		});

		test.concurrent('withReplies: false でフォローしているユーザーのそのユーザー自身への返信が含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		});

		test.concurrent('自分の他人への返信が含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi' });
			const aliceNote = await post(alice, { text: 'hi', replyId: bobNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === aliceNote.id), true);
		});

		test.concurrent('フォローしているユーザーの他人の投稿のリノートが含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { renoteId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('[withRenotes: false] フォローしているユーザーの他人の投稿のリノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { renoteId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {
				withRenotes: false,
			}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('[withRenotes: false] フォローしているユーザーの他人の投稿の引用が含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {
				withRenotes: false,
			}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('フォローしているユーザーの他人への visibility: specified なノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [carol.id] });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('フォローしているユーザーが行ったミュートしているユーザーのリノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/mute/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: true でフォローしているユーザーが行ったミュートしているユーザーの投稿への返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await api('/mute/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('フォローしているリモートユーザーのノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('フォローしているリモートユーザーの visibility: home なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('[withFiles: true] フォローしているユーザーのファイル付きノートのみ含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const [bobFile, carolFile] = await Promise.all([
				uploadUrl(bob, 'https://raw.githubusercontent.com/misskey-dev/assets/main/icon.png'),
				uploadUrl(carol, 'https://raw.githubusercontent.com/misskey-dev/assets/main/icon.png'),
			]);
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { fileIds: [bobFile.id] });
			const carolNote1 = await post(carol, { text: 'hi' });
			const carolNote2 = await post(carol, { fileIds: [carolFile.id] });

			await waitForPushToTl();

			const res = await api('/notes/timeline', { withFiles: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote1.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote2.id), false);
		}, 1000 * 10);

		test.concurrent('フォローしているユーザーのチャンネル投稿が含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const channel = await api('/channels/create', { name: 'channel' }, bob).then(x => x.body);
			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('自分の visibility: specified なノートが含まれる', async () => {
			const [alice] = await Promise.all([signup()]);

			const aliceNote = await post(alice, { text: 'hi', visibility: 'specified' });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === aliceNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === aliceNote.id).text, 'hi');
		});

		test.concurrent('相手が自身を visibleUserIds に指定した visibility: specified なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === bobNote.id).text, 'hi');
		});

		test.concurrent('相手が自身を visibleUserIds に指定していない visibility: specified なノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [carol.id] });

			await waitForPushToTl();

			const res = await api('/notes/timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('visibility: specified なノートを返信したときのノートが返信元の人と自身に含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });
			const aliceNote = await post(alice, { text: 'ok', visibility: 'specified', visibleUserIds: [bob.id], replyId: bobNote.id });

			await waitForPushToTl();

			const aliceRes = await api('/notes/timeline', {}, alice);

			assert.strictEqual(aliceRes.body.some((note: any) => note.id === aliceNote.id), true);
			assert.strictEqual(aliceRes.body.find((note: any) => note.id === aliceNote.id).text, 'ok');

			const bobRes = await api('/notes/timeline', {}, bob);

			assert.strictEqual(bobRes.body.some((note: any) => note.id === aliceNote.id), true);
			assert.strictEqual(bobRes.body.find((note: any) => note.id === aliceNote.id).text, 'ok');
		});
	});

	describe('Local TL', () => {
		test.concurrent('visibility: home なノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const carolNote = await post(carol, { text: 'hi', visibility: 'home' });
			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('チャンネル投稿が含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const channel = await api('/channels/create', { name: 'channel' }, bob).then(x => x.body);
			const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('リモートユーザーのノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		// 含まれても良いと思うけど実装が面倒なので含まれない
		test.concurrent('フォローしているユーザーの visibility: home なノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi', visibility: 'home' });
			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('ミュートしているユーザーのノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/mute/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('フォローしているユーザーが行ったミュートしているユーザーのリノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/mute/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('withReplies: true でフォローしているユーザーが行ったミュートしているユーザーの投稿への返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await api('/following/update', { userId: bob.id, withReplies: true }, alice);
			await api('/mute/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === carolNote.id), false);
		});

		test.concurrent('[withFiles: true] ファイル付きノートのみ含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const file = await uploadUrl(bob, 'https://raw.githubusercontent.com/misskey-dev/assets/main/icon.png');
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { fileIds: [file.id] });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', { withFiles: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		}, 1000 * 10);
	});

	describe('Social TL', () => {
		test.concurrent('ローカルユーザーのノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/hybrid-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('ローカルユーザーの visibility: home なノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

			await waitForPushToTl();

			const res = await api('/notes/hybrid-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('フォローしているローカルユーザーの visibility: home なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

			await waitForPushToTl();

			const res = await api('/notes/hybrid-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('リモートユーザーのノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/local-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('フォローしているリモートユーザーのノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/hybrid-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('フォローしているリモートユーザーの visibility: home なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup({ host: genHost() })]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

			await waitForPushToTl();

			const res = await api('/notes/hybrid-timeline', {}, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('[withFiles: true] ファイル付きノートのみ含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const file = await uploadUrl(bob, 'https://raw.githubusercontent.com/misskey-dev/assets/main/icon.png');
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { fileIds: [file.id] });

			await waitForPushToTl();

			const res = await api('/notes/hybrid-timeline', { withFiles: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		}, 1000 * 10);
	});

	describe('User List TL', () => {
		test.concurrent('リスインしているフォローしていないユーザーのノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('リスインしているフォローしていないユーザーの visibility: home なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		/* 未実装
		test.concurrent('リスインしているフォローしていないユーザーの visibility: followers なノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});
		*/

		test.concurrent('リスインしているフォローしていないユーザーの visibility: followers なノートが含まれるが隠される', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === bobNote.id).text, null);
		});

		test.concurrent('リスインしているフォローしていないユーザーの他人への返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('リスインしているフォローしていないユーザーのユーザー自身への返信が含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		});

		test.concurrent('withReplies: true でリスインしているフォローしていないユーザーの他人への返信が含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await api('/users/lists/update-membership', { listId: list.id, userId: bob.id, withReplies: true }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('リスインしているフォローしているユーザーの visibility: home なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'home' });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('リスインしているフォローしているユーザーの visibility: followers なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === bobNote.id).text, 'hi');
		});

		test.concurrent('リスインしているユーザーのチャンネルノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const channel = await api('/channels/create', { name: 'channel' }, bob).then(x => x.body);
			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('[withFiles: true] リスインしているユーザーのファイル付きノートのみ含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			const file = await uploadUrl(bob, 'https://raw.githubusercontent.com/misskey-dev/assets/main/icon.png');
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { fileIds: [file.id] });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id, withFiles: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		}, 1000 * 10);

		test.concurrent('リスインしているユーザーの自身宛ての visibility: specified なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [alice.id] });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === bobNote.id).text, 'hi');
		});

		test.concurrent('リスインしているユーザーの自身宛てではない visibility: specified なノートが含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const list = await api('/users/lists/create', { name: 'list' }, alice).then(res => res.body);
			await api('/users/lists/push', { listId: list.id, userId: bob.id }, alice);
			await api('/users/lists/push', { listId: list.id, userId: carol.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'specified', visibleUserIds: [carol.id] });

			await waitForPushToTl();

			const res = await api('/notes/user-list-timeline', { listId: list.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});
	});

	describe('User TL', () => {
		test.concurrent('ノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('フォローしていないユーザーの visibility: followers なノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('フォローしているユーザーの visibility: followers なノートが含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			await api('/following/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote = await post(bob, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === bobNote.id).text, 'hi');
		});

		test.concurrent('自身の visibility: followers なノートが含まれる', async () => {
			const [alice] = await Promise.all([signup()]);

			const aliceNote = await post(alice, { text: 'hi', visibility: 'followers' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: alice.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === aliceNote.id), true);
			assert.strictEqual(res.body.find((note: any) => note.id === aliceNote.id).text, 'hi');
		});

		test.concurrent('チャンネル投稿が含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const channel = await api('/channels/create', { name: 'channel' }, bob).then(x => x.body);
			const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('[withReplies: false] 他人への返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const carolNote = await post(carol, { text: 'hi' });
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), false);
		});

		test.concurrent('[withReplies: true] 他人への返信が含まれる', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const carolNote = await post(carol, { text: 'hi' });
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { text: 'hi', replyId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id, withReplies: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		});

		test.concurrent('[withReplies: true] 他人への visibility: specified な返信が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			const carolNote = await post(carol, { text: 'hi' });
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { text: 'hi', replyId: carolNote.id, visibility: 'specified' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id, withReplies: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), false);
		});

		test.concurrent('[withFiles: true] ファイル付きノートのみ含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const file = await uploadUrl(bob, 'https://raw.githubusercontent.com/misskey-dev/assets/main/icon.png');
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { fileIds: [file.id] });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id, withFiles: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), false);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
		}, 1000 * 10);

		test.concurrent('[withChannelNotes: true] チャンネル投稿が含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const channel = await api('/channels/create', { name: 'channel' }, bob).then(x => x.body);
			const bobNote = await post(bob, { text: 'hi', channelId: channel.id });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id, withChannelNotes: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), true);
		});

		test.concurrent('ミュートしているユーザーに関連する投稿が含まれない', async () => {
			const [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);

			await api('/mute/create', { userId: carol.id }, alice);
			await sleep(1000);
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi', renoteId: carolNote.id });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});

		test.concurrent('ミュートしていても userId に指定したユーザーの投稿が含まれる', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			await api('/mute/create', { userId: bob.id }, alice);
			await sleep(1000);
			const bobNote1 = await post(bob, { text: 'hi' });
			const bobNote2 = await post(bob, { text: 'hi', replyId: bobNote1.id });
			const bobNote3 = await post(bob, { text: 'hi', renoteId: bobNote1.id });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote1.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote2.id), true);
			assert.strictEqual(res.body.some((note: any) => note.id === bobNote3.id), true);
		});

		test.concurrent('自身の visibility: specified なノートが含まれる', async () => {
			const [alice] = await Promise.all([signup()]);

			const aliceNote = await post(alice, { text: 'hi', visibility: 'specified' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: alice.id, withReplies: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === aliceNote.id), true);
		});

		test.concurrent('visibleUserIds に指定されてない visibility: specified なノートが含まれない', async () => {
			const [alice, bob] = await Promise.all([signup(), signup()]);

			const bobNote = await post(bob, { text: 'hi', visibility: 'specified' });

			await waitForPushToTl();

			const res = await api('/users/notes', { userId: bob.id, withReplies: true }, alice);

			assert.strictEqual(res.body.some((note: any) => note.id === bobNote.id), false);
		});
	});

	// TODO: リノートミュート済みユーザーのテスト
	// TODO: ページネーションのテスト
});
