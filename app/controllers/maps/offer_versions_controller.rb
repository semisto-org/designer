# Saved versions of an offer (V1, V2…): save the working offer as the next
# version, change a version's status or note, start again from a version,
# and its printable page (the budget as the client will read it).
module Maps
  class OfferVersionsController < ApplicationController
    include OfferScoped

    before_action :require_editor!, except: :show
    before_action :set_version, except: :create

    def show
      document = Offer::ClientDocument.for(@version, map: @map, issuer: offer_issuer)
      respond_to do |format|
        format.html do
          render inertia: "maps/offers/version", props: client_document_props(document).merge(
            version: version_json(@version).merge(
              inputs: @version.inputs, measures: @version.measures, result: @version.result, terms: document.terms
            )
          )
        end
        format.docx { send_docx(document, label: @version.label, date: @version.created_at.to_date) }
      end
    end

    def create
      return render(json: { message: t("offers.errors.save_first") }, status: :unprocessable_entity) unless @offer.persisted?
      version = @offer.save_version!(user: Current.user, note: params[:note])
      render json: { version: version_json(version), versions: versions_json }, status: :created
    rescue ActiveRecord::RecordNotUnique
      render json: { message: t("offers.errors.stale") }, status: :conflict
    end

    def update
      if @version.update(params.require(:version).permit(:status, :note))
        render json: { version: version_json(@version), versions: versions_json }
      else
        render_errors @version
      end
    end

    def restore
      @offer.restore!(@version, user: Current.user)
      render json: { offer: offer_json, measures: measures_json, result: @offer.result }
    end

    private
      def set_version
        @version = @offer.versions.find_by!(number: params[:number])
      end
  end
end
