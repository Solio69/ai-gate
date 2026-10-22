export interface Exchange {
  id: string
  sessionId: string
  prompt: string
  answer: string
  createdAt: string
}

export type LocalExchange = Omit<Exchange, 'sessionId'>
