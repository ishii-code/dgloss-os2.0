/**
 * Google Chat の cardsV2 生成。回答本文＋出典リンクをリッチカードで見やすく返す。
 * text も併せて返す（通知やカード非対応クライアントのフォールバック）。
 * 参考: https://developers.google.com/workspace/chat/api/reference/rest/v1/cards
 */

interface ChatButton {
  text: string;
  onClick: { openLink: { url: string } };
}
interface ChatWidget {
  textParagraph?: { text: string };
  buttonList?: { buttons: ChatButton[] };
}
interface ChatSection {
  header?: string;
  widgets: ChatWidget[];
}
export interface ChatCardV2 {
  cardId: string;
  card: { header?: { title: string }; sections: ChatSection[] };
}

export interface ChatMessagePayload {
  text: string;
  cardsV2?: ChatCardV2[];
}

/** URL からラベルを推定（Docs/Drive/Gmail を短く） */
function labelFor(url: string, index: number): string {
  if (url.includes("mail.google.com")) return `メール${index + 1}`;
  if (url.includes("docs.google.com")) return `ドキュメント${index + 1}`;
  if (url.includes("drive.google.com")) return `ファイル${index + 1}`;
  return `出典${index + 1}`;
}

export function buildAnswerPayload(answer: string, citations: string[]): ChatMessagePayload {
  const sections: ChatSection[] = [{ widgets: [{ textParagraph: { text: answer } }] }];

  if (citations.length > 0) {
    sections.push({
      header: "出典",
      widgets: [
        {
          buttonList: {
            buttons: citations.slice(0, 6).map((url, i) => ({
              text: labelFor(url, i),
              onClick: { openLink: { url } },
            })),
          },
        },
      ],
    });
  }

  return {
    text: answer, // フォールバック
    cardsV2: [
      {
        cardId: "brain-answer",
        card: {
          header: { title: "ディグロス・ブレイン" },
          sections,
        },
      },
    ],
  };
}
