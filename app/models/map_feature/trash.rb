# Deleting an element puts it in the map's trash instead of erasing it, so
# the editor's « Annuler » (⌘Z / Ctrl+Z) can restore it whole: same id, same
# plant number when still free, its photos, readings, harvests and comments.
# Trashed elements are invisible everywhere (default scope; raw SQL on
# map_features filters `deleted_at IS NULL`) and erased for good after
# KEEP_FOR by `MapFeature.purge_trash` (config/recurring.yml).
module MapFeature::Trash
  extend ActiveSupport::Concern

  KEEP_FOR = 30.days

  included do
    default_scope { where(deleted_at: nil) }
    scope :trashed, -> { unscope(where: :deleted_at).where.not(deleted_at: nil) }
  end

  class_methods do
    def purge_trash(before: KEEP_FOR.ago)
      trashed.where(deleted_at: ...before).find_each(&:destroy)
    end
  end

  def trashed? = deleted_at.present?

  def trash!(by: nil)
    self.updated_by = by if by
    update!(deleted_at: Time.current)
  end

  # A plant whose number was given to another plant meanwhile takes the
  # next free one.
  def restore!(by: nil)
    self.updated_by = by if by
    self.deleted_at = nil
    if plant? && plant_number_holder
      self.properties = properties.merge("number" => send(:next_plant_number))
    end
    save!
  end
end
