# Anything a discussion can hang on: the map itself, a feature, later photos,
# analyses, design versions… Including models only have to say which map they
# belong to (`comment_map`) and how to name themselves (`comment_title`).
#
# To make a new model commentable: include Commentable, implement the two
# methods, and add its class name to Commentable::TYPES.
module Commentable
  extend ActiveSupport::Concern

  # Class names accepted by the comments API (never constantize user input).
  TYPES = %w[Map MapFeature].freeze

  included do
    has_many :comments, as: :commentable, dependent: :destroy
    has_many :comment_subscriptions, as: :commentable, dependent: :destroy
    has_many :comment_reads, as: :commentable, dependent: :destroy
  end

  # Finds a commentable of a map from the (type, id) a client sent, or nil.
  def self.find_in_map(map, type, id)
    return nil unless TYPES.include?(type.to_s)
    record = type.to_s.constantize.find_by(id:)
    record if record&.comment_map == map
  end

  def comment_map = raise(NotImplementedError, "#{self.class} must implement #comment_map")
  def comment_title = respond_to?(:name) && name.presence || self.class.model_name.human

  # [type, id] pair used in URLs (?discussion=MapFeature:12) and JSON.
  def comment_key = "#{self.class.name}:#{id}"
end
