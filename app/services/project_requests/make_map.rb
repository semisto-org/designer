# « Créer la carte »: a request becomes a map of its place, owned by the
# person who makes it (and in the team, for a team's form), with its
# outline, the project sheet's first answers and the prospect's photos.
# From there the offer builder takes over.
module ProjectRequests
  class MakeMap
    class Refused < StandardError; end

    def initialize(request, user)
      @request = request
      @user = user
    end

    def call
      return @request.map if @request.map
      raise Refused, I18n.t("maps.errors.plan_limit") unless scope.can_create_map?

      map = nil
      ActiveRecord::Base.transaction do
        map = @user.owned_maps.create!(
          name: I18n.t("request_forms.requests.map_name", name: @request.name).first(120),
          address: @request.address,
          center: @request.center,
          region: @request.region,
          boundary: @request.boundary,
          parcels: @request.boundary ? @request.parcels.map { _1["capakey"] } : [],
          organization: (@request.request_form.owner if @request.request_form.team?)
        )
        ProjectSheet.save!(map, ProjectSheet.parse(@request.project_patch, strict: false))
        @request.update!(map:)
      end
      copy_photos(map)
      map
    end

    private
      # A team's map counts in the team's plan when someone pays for it.
      def scope
        form = @request.request_form
        Billing::Scope.for_new_map(@user, team: (form.owner if form.team?))
      end

      # A photo the map refuses (a twin, a file it cannot read) is skipped.
      def copy_photos(map)
        @request.photos.each do |photo|
          image = { io: StringIO.new(photo.download), filename: photo.filename.to_s, content_type: photo.content_type }
          MapPhoto.create(map:, uploaded_by: @user, source: "import", image:, skip_storage_quota: true)
        rescue ActiveStorage::FileNotFoundError
          next
        end
      end
  end
end
