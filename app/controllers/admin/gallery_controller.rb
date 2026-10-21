# Super admin « Carnets ouverts »: the published maps whose owner offered them
# to the public site's gallery. Staff choose which ones it shows, in which
# order, and the one the features page visits.
module Admin
  class GalleryController < BaseController
    def index
      publications = MapPublication.offered_to_gallery.includes(map: :owner).with_attached_preview_image
                                   .order(Arel.sql("map_publications.gallery_position IS NULL, map_publications.gallery_position, map_publications.published_at DESC"))
      render inertia: "admin/gallery/index", props: {
        publications: publications.map do |publication|
          publication.as_gallery_card.except(:boundary).merge(
            id: publication.id, mapName: publication.map.name, ownerEmail: publication.map.owner&.email_address,
            chosen: publication.gallery_position.present?, tour: publication.site_tour, publishedAt: publication.published_at.iso8601
          )
        end
      }
    end

    # choice: "show" | "hide" | "tour" | "up" | "down"
    def update
      publication = MapPublication.offered_to_gallery.find(params[:id])
      case params[:choice]
      when "show" then publication.choose_for_gallery!
      when "hide" then publication.remove_from_gallery!
      when "tour" then publication.choose_for_tour!
      when "up", "down" then move(publication, params[:choice] == "up" ? -1 : 1)
      else return head :unprocessable_entity
      end
      redirect_to admin_gallery_index_path, notice: t("admin.gallery.saved"), status: :see_other
    end

    private
      # Swaps the publication with its neighbour in the gallery.
      def move(publication, step)
        chosen = MapPublication.in_gallery.to_a
        index = chosen.index(publication) or return
        other = chosen[index + step]
        return unless other && index + step >= 0
        MapPublication.transaction do
          chosen[index], chosen[index + step] = other, publication
          chosen.each_with_index { |item, i| item.update_column(:gallery_position, i + 1) }
        end
      end
  end
end
