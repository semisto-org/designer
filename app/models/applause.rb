# A user's applause ("applaudissement") on a comment: at most one each.
class Applause < ApplicationRecord
  belongs_to :comment
  belongs_to :user
  validates :user_id, uniqueness: { scope: :comment_id }
end
