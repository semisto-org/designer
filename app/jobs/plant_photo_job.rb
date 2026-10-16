# Gives a species of the catalogue its main photo, from Wikimedia Commons
# (Providers::WikimediaCommons), with its author and licence (PlantPhoto).
#
# The recurring backfill (config/recurring.yml) goes through the species that
# were never looked up, a few at a time and one after the other as Wikimedia
# asks; a species with no free image is looked up again a month later, in
# case someone added one. When Wikimedia does not answer, the batch stops
# and nothing is recorded, so the next run tries the same species again.
class PlantPhotoJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  BACKFILL_BATCH = 25
  RETRY_AFTER = 30.days

  def self.backfill(limit: BACKFILL_BATCH, provider: Providers::WikimediaCommons.build)
    return 0 unless provider.available?

    due = PlantSpecies.where.missing(:photos)
                      .where("plant_species.photo_looked_up_at IS NULL OR plant_species.photo_looked_up_at < ?", RETRY_AFTER.ago)
                      .order(Arel.sql("plant_species.photo_looked_up_at NULLS FIRST, plant_species.id")).limit(limit)
    due.to_a.each { |species| new.perform(species, provider:) }.size
  rescue Providers::WikimediaCommons::Unavailable => error
    Rails.logger.warn("[plants] Wikimedia Commons unavailable, photos postponed: #{error.message}")
    0
  end

  def perform(species, provider: Providers::WikimediaCommons.build)
    return unless provider.available?
    return species.update_columns(photo_looked_up_at: Time.current) if species.photos.exists?

    image = provider.main_image(species.latin_name)
    PlantPhoto.from_commons(species, image, provider.download(image)) if image
    species.update_columns(photo_looked_up_at: Time.current)
  end
end
