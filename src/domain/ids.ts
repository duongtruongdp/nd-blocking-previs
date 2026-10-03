export type IdFactory = () => string

export const createId: IdFactory = () => crypto.randomUUID()
