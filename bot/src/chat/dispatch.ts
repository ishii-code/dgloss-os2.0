/**
 * 非同期ディスパッチ（S4）。受付応答を返した後の回答生成をどう回すか。
 *  - off       : 同期（受付応答なし・その場で回答）。最小構成/テスト向け
 *  - inline    : 応答後にプロセス内バックグラウンドで処理（Cloud Runは「CPU常時割当」推奨）
 *  - cloudtasks: Cloud Tasks にジョブを積み、/tasks/answer ワーカーで処理（本番・スケール向け）
 */
import { config } from "../config.js";
import { processAndPost } from "../brain/process.js";
import type { BrainRequest } from "./types.js";

export async function dispatchAnswer(req: BrainRequest): Promise<void> {
  if (config.async.mode === "cloudtasks") {
    await enqueueCloudTask(req);
    return;
  }
  // inline: 受付応答を返した後に背景で実行（awaitしない）
  void processAndPost(req);
}

async function enqueueCloudTask(req: BrainRequest): Promise<void> {
  if (!config.tasks.queuePath || !config.tasks.workerUrl) {
    throw new Error("ASYNC_MODE=cloudtasks には TASKS_QUEUE_PATH と TASKS_WORKER_URL が必要です");
  }
  const { CloudTasksClient } = await import("@google-cloud/tasks");
  const client = new CloudTasksClient();
  await client.createTask({
    parent: config.tasks.queuePath,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: config.tasks.workerUrl,
        headers: {
          "Content-Type": "application/json",
          "x-task-token": config.tasks.token ?? "",
        },
        body: Buffer.from(JSON.stringify(req)), // 配信時はJSONバイト列としてワーカーに届く
        ...(config.tasks.invokerSaEmail
          ? { oidcToken: { serviceAccountEmail: config.tasks.invokerSaEmail } }
          : {}),
      },
    },
  });
}
