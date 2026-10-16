# A help center search that found nothing, counted by query: the list of
# guides still to write, read by staff in /admin/help.
class HelpSearchMiss < ApplicationRecord
  MIN_LENGTH = 3
  MAX_LENGTH = 100
  # The search runs as the person types: « baisi » then « baisie » then
  # « baisiere » would each count. A shorter miss seen this recently was
  # only the beginning of the one being recorded, and is dropped.
  TYPING_WINDOW = 15.seconds

  scope :most_searched, -> { order(count: :desc, last_searched_at: :desc) }

  def self.record(query, at: Time.current)
    query = HelpArticle.normalize(query).squish.first(MAX_LENGTH)
    return if query.length < MIN_LENGTH
    where("last_searched_at >= ? AND count = 1 AND left(?, length(query)) = query AND query <> ?", at - TYPING_WINDOW, query, query)
      .delete_all
    upsert({ query:, count: 1, last_searched_at: at, created_at: at, updated_at: at },
      unique_by: :query,
      on_duplicate: Arel.sql("count = help_search_misses.count + 1, last_searched_at = EXCLUDED.last_searched_at, updated_at = EXCLUDED.updated_at"))
  end
end
