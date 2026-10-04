# « Identify the species by photo » from a plant's inspector: one to five
# photos (multipart `images[]`) go to Pl@ntNet and come back as candidate
# species, matched to the catalogue. Editors only; nothing is saved here, the
# editor saves the species the human picks through the features endpoint.
#
#   200 { available: true, candidates: [...], credit: "Pl@ntNet" }  (possibly empty)
#   422 { code: "invalid", message }          no photo, too many, not a photo
#   429 { code: "rate_limited", message }
#   503 { available: false, code: "not_configured", message }
#   503 { available: true, code: "unavailable" | "quota", message }
module Maps
  class PlantIdentificationsController < ApplicationController
    include MapScoped

    CREDIT = "Pl@ntNet".freeze

    rate_limit to: 20, within: 1.minute, only: :create, by: -> { Current.user&.id },
      with: -> { render json: { code: "rate_limited", message: t("plantnet.errors.rate_limited") }, status: :too_many_requests }

    before_action :set_map
    before_action :require_editor!

    def create
      result = PlantIdentification.new(files: Array(params[:images]).grep(ActionDispatch::Http::UploadedFile)).run
      render json: { available: true, candidates: result.candidates.map(&:as_json), credit: CREDIT }
    rescue PlantIdentification::Invalid => error
      render json: { code: "invalid", message: error.message }, status: :unprocessable_entity
    rescue Providers::PlantNet::NotConfigured
      render json: { available: false, code: "not_configured", message: t("plantnet.errors.not_configured") }, status: :service_unavailable
    rescue Providers::PlantNet::Unavailable => error
      Rails.logger.warn("[plantnet] #{error.message}")
      code = error.reason == :quota ? "quota" : "unavailable"
      render json: { available: true, code:, message: t("plantnet.errors.#{code}") }, status: :service_unavailable
    end
  end
end
