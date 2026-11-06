# The project variants of a map (« Projet 1 », « Projet 2 »): everyone on
# the map reads them, editors create, rename, retain, duplicate and delete
# them. `from_tag` turns the planned elements carrying a tag (the former
# « Version » picker) into a variant. Each answer gives the map's variants.
module Maps
  class VariantsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_variant, only: %i[update destroy duplicate]

    def index
      render json: payload
    end

    # On a map without variants, the project as it stands becomes
    # « Projet 1 » (retained) and the new one is the second idea.
    def create
      attributes = params.fetch(:variant, {}).permit(:name, :notes)
      tag = params[:from_tag].to_s.strip.presence
      variant = nil
      MapVariant.transaction do
        @map.variants.create!(name: t("variants.default_name", number: 1)) if tag.nil? && !@map.variants.exists?
        variant = @map.variants.new(attributes)
        variant.name = tag&.first(60) || t("variants.default_name", number: @map.variants.count + 1) if variant.name.blank?
        variant.save!
        take_tagged!(variant, tag) if tag
      end
      render json: payload.merge(id: variant.id), status: :created
    rescue ActiveRecord::RecordInvalid => error
      render json: { message: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def update
      attributes = params.require(:variant).permit(:name, :notes, :retained)
      retain = ActiveModel::Type::Boolean.new.cast(attributes.delete(:retained))
      if @variant.update(attributes)
        @variant.retain! if retain
        render json: payload
      else
        render json: { message: @variant.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end

    def duplicate
      name = params[:name].presence || t("variants.copy_name", name: @variant.name)
      copy = @variant.duplicate!(name: name.to_s.first(60), by: Current.user)
      render json: payload.merge(id: copy.id, features: copy.features.map(&:as_geojson)), status: :created
    rescue ActiveRecord::RecordInvalid => error
      render json: { message: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def destroy
      trashed = @variant.features.pluck(:id)
      @variant.destroy!
      render json: payload.merge(trashed:)
    end

    private
      def set_variant
        @variant = @map.variants.find(params[:id])
      end

      def payload
        { variants: @map.variants.reload.as_json }
      end

      # The planned elements carrying this tag (any case) join the variant.
      def take_tagged!(variant, tag)
        wanted = tag.downcase
        @map.features.active.planned.where(variant_id: nil).find_each do |feature|
          next unless Array(feature.tags).any? { _1.to_s.downcase == wanted }
          feature.update!(variant:, updated_by: Current.user)
        end
      end
  end
end
