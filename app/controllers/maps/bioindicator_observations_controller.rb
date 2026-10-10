# Bio-indicator plants seen on the terrain, and what they say about the soil.
# Free for everyone: the list and its meaning are reference, not an analysis.
#
# A plant noted from a photo (identified by Pl@ntNet, then confirmed by the
# person) sends the photo along with the observation (multipart
# `bioindicator_observation[photo]`): it joins the map's photos with the same
# position, and the observation keeps it.
#
# A photo of several wild plants is rather left for the user's AI (a map photo
# with `bioindicator_status` to_analyze, sent through Maps::PhotosController).
# The AI proposes what it sees through the MCP, as draft observations: `accept`
# keeps one, `destroy` refuses it. Drafts count for nothing in the summary.
module Maps
  class BioindicatorObservationsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: %i[index species]
    before_action :set_observation, only: %i[update destroy accept]

    def index
      observations = @map.bioindicator_observations.recent.includes(:observed_by).to_a
      photos = @map.photos.for_bioindicators.chronological.includes(:uploaded_by, image_attachment: :blob)
      render json: {
        observations: observations.map(&:as_inertia),
        summary: SoilAnalysis::BioindicatorCatalog.tally(observations.reject(&:draft?)),
        photos: photos.map(&:as_inertia),
        catalog: SoilAnalysis::BioindicatorCatalog.all,
        plantCatalog: SoilAnalysis::SpeciesLookup.available?
      }
    end

    # Suggestions for the species field: the curated list first, then the plant
    # catalogue when there is one.
    def species
      query = params[:q].to_s
      render json: {
        catalog: SoilAnalysis::BioindicatorCatalog.search(query, limit: 8),
        plants: SoilAnalysis::SpeciesLookup.search(query, limit: 8)
      }
    end

    def create
      attributes = observation_params
      observed_on = attributes[:observed_on].presence || photo_date || Date.current
      observation = @map.bioindicator_observations.new(attributes.merge(observed_by: Current.user, observed_on:))
      saved = BioindicatorObservation.transaction do
        raise ActiveRecord::Rollback unless attach_photo(observation) && observation.save
        true
      end
      saved ? render(json: observation.as_inertia, status: :created) : render_errors(observation)
    end

    def update
      saved = @observation.update(observation_params)
      locate_photo(@observation) if saved
      saved ? render(json: @observation.as_inertia) : render_errors(@observation)
    end

    # Keeps a plant the AI proposed.
    def accept
      @observation.accept!
      render json: @observation.as_inertia
    end

    def destroy
      @observation.destroy!
      head :no_content
    end

    private
      def set_observation
        @observation = @map.bioindicator_observations.find(params[:id])
      end

      def observation_params
        raw = params.require(:bioindicator_observation).permit(:species_name, :latin_name, :catalog_key, :plant_species_id, :abundance, :observed_on, :notes, :lng, :lat, :map_photo_id)
        raw[:location] = MapPhoto.point_from(raw[:lng], raw[:lat]) if raw.key?(:lng) || raw.key?(:lat)
        raw[:map_photo_id] = @map.photos.find(raw[:map_photo_id]).id if raw[:map_photo_id].present?
        raw.except(:lng, :lat)
      end

      # What comes with the photo: the file, when and how it was taken, how
      # its position was found (exif, device, map).
      def photo_params
        params.require(:bioindicator_observation).permit(:photo, :photo_taken_at, :photo_heading, :photo_source, :location_source)
      end

      def photo_date
        Time.zone.parse(photo_params[:photo_taken_at].to_s)&.to_date
      rescue ArgumentError
        nil
      end

      # Stores the uploaded photo with the observation's position. The same file
      # already in the map is reused rather than refused. False (errors copied
      # on the observation) when the photo is not acceptable.
      def attach_photo(observation)
        file = photo_params[:photo]
        return true unless file.is_a?(ActionDispatch::Http::UploadedFile)

        photo = @map.photos.new(
          image: file, uploaded_by: Current.user, caption: observation.species_name.presence || observation.catalog_entry&.dig("name"),
          source: photo_params[:photo_source].presence_in(MapPhoto::SOURCES) || "web",
          taken_at: photo_params[:photo_taken_at].presence, heading: photo_params[:photo_heading].presence,
          location: observation.location,
          location_source: observation.location && (photo_params[:location_source].presence_in(MapPhoto::LOCATION_SOURCES) || "manual")
        )
        if photo.save
          observation.photo = photo
        elsif photo.errors.of_kind?(:base, :already_imported)
          observation.photo = @map.photos.find_by!(checksum: photo.checksum)
        else
          photo.errors.full_messages.each { |message| observation.errors.add(:base, message) }
          return false
        end
        true
      end

      # Placed on the map after the fact: its photo, if it had no position,
      # takes the same one.
      def locate_photo(observation)
        photo = observation.photo
        return unless photo && photo.location.nil? && observation.location
        photo.update(location: observation.location, location_source: "map")
      end
  end
end
