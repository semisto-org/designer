import { createConsumer, type Consumer } from '@rails/actioncable'

let consumer: Consumer | null = null

/** The page's one Action Cable connection, opened the first time it is needed. */
export function cable(): Consumer {
  consumer ??= createConsumer()
  return consumer
}
