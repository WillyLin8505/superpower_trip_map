export const LINE_BIND_COMMAND = '/綁定'
export const LINE_UNBIND_COMMAND = '/解除綁定'

export const LINE_MESSAGES = {
  bindUsage: `請使用：${LINE_BIND_COMMAND} <行程邀請連結或 token>`,
  bindSuccess: '已成功綁定 LINE 與本次行程。',
  bindTripNotFound: '找不到對應的行程，請確認邀請連結或 token 是否正確。',
  bindAlreadyActive: `你已經綁定其他行程，如需改綁請先輸入 ${LINE_UNBIND_COMMAND}。`,
  unbindSuccess: '已解除目前的 LINE 綁定。',
  unbindNotBound: '目前沒有可解除的 LINE 綁定。',
  added: (placeName: string) => `已加入候選地點：${placeName}`,
  duplicate: (placeName: string) => `這個地點已存在：${placeName}`,
  addedMany: (count: number) => `已加入 ${count} 個候選地點。`,
  noPlaceFound: '沒有辨識出可加入的地點。',
  articleFailed: '文章解析失敗，請改貼地圖連結或更明確的內容。',
} as const
