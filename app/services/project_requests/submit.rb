# A prospect sends a professional's request form (/demande/:slug): their
# details, answers, place and photos become a ProjectRequest, then the
# account's people are told and the prospect gets a confirmation.
#
# The place: the parcels picked on the map (resolved again through the
# region's cadastre, never trusted from the client) or, without them, the
# pin. A cadastre that cannot answer does not lose the request: the parcels
# are kept with their references and the team draws the outline later.
module ProjectRequests
  class Submit
    class Invalid < StandardError
      attr_reader :errors

      def initialize(errors)
        @errors = errors
        super(errors.to_s)
      end
    end

    MAX_PARCELS = Boundaries::ParcelUnion::MAX_PARCELS

    # params: name, email, phone, address, message, answers (Hash),
    # center ([lng, lat]), parcels ([{ capakey, lng, lat, label }]).
    def initialize(form, params, photos: [])
      @form = form
      @params = params
      @photos = Array(photos).compact_blank
    end

    def call
      answers, answer_errors = ProjectRequest.parse_answers(@params[:answers])
      raise Invalid, { answers: answer_errors } if answer_errors.any?

      request = @form.project_requests.new(
        name: @params[:name], email: @params[:email], phone: @params[:phone],
        address: @params[:address], message: @params[:message].to_s.strip.presence, answers:
      )
      place(request)
      @photos.first(ProjectRequest::MAX_PHOTOS + 1).each { request.photos.attach(_1) }
      raise Invalid, request.errors.to_hash unless request.save

      @form.recipients.each { ProjectRequestMailer.received(request, _1).deliver_later }
      ProjectRequestMailer.confirmation(request).deliver_later
      request
    end

    private
      def place(request)
        parcels = parcels_param
        center = point(@params[:center]) || (parcels.first && point([ parcels.first[:lng], parcels.first[:lat] ]))
        return unless center

        request.center = center
        request.region = Region.for_point(center.x, center.y)
        return if parcels.empty?

        request.parcels = parcels.map { _1.slice(:capakey, :lng, :lat, :label).stringify_keys }
        outline(request, parcels)
      end

      # The union of the parcels, when the cadastre answers for all of them.
      def outline(request, parcels)
        cadastre = Providers::Cadastre.for(request.region)
        return unless cadastre
        found = parcels.map { |p| cadastre.parcel(p[:capakey], lng: p[:lng], lat: p[:lat]) }
        return if found.any?(&:nil?)

        request.parcels = found.map { |p| { "capakey" => p.capakey, "lng" => p.lng, "lat" => p.lat, "label" => p.label } }
        request.boundary = ProjectRequest.parse_geojson(Boundaries::GeometryUnion.call(found.map(&:geometry)))
        request.center = request.boundary.centroid if request.boundary
        request.area_m2 = area(request.boundary)
      rescue Providers::GeoHttp::Error, Boundaries::GeometryUnion::Empty => error
        Rails.logger.info("[project_request] outline: #{error.class}: #{error.message}")
      end

      def parcels_param
        Array(@params[:parcels]).filter_map do |raw|
          raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
          next unless raw.is_a?(Hash)
          raw = raw.symbolize_keys
          capakey = raw[:capakey].to_s.strip.first(80)
          lng, lat = Float(raw[:lng]), Float(raw[:lat])
          next if capakey.blank? || !lng.between?(-180, 180) || !lat.between?(-90, 90)
          { capakey:, lng:, lat:, label: raw[:label].to_s.squish.first(120).presence }
        rescue ArgumentError, TypeError
          nil
        end.uniq { _1[:capakey] }.first(MAX_PARCELS)
      end

      def point(coords)
        lng, lat = Array(coords).first(2).map { Float(_1) }
        return nil unless lng && lat && lng.between?(-180, 180) && lat.between?(-90, 90)
        GeoJsonGeometry::FACTORY.point(lng, lat)
      rescue ArgumentError, TypeError
        nil
      end

      def area(geometry)
        return nil unless geometry
        value = ActiveRecord::Base.connection.select_value(
          ActiveRecord::Base.sanitize_sql_array([ "SELECT ST_Area(ST_GeomFromText(?, 4326)::geography)", geometry.as_text ])
        )
        value&.to_f&.round(1)
      end
  end
end
