module Providers
  class Cadastre
    # Cadastre published as an INSPIRE WFS (Luxembourg: ACT,
    # wms.inspire.geoportail.lu, CC0): GetFeature on CP.CadastralParcel in a
    # tiny box around the point, GeoJSON output, then the parcel that
    # contains the point. Attributes: national_cadastral_reference, label,
    # area (m²).
    class InspireWfs < Adapter
      BOX_DEG = 0.00002

      private
        def find(lng, lat)
          params = {
            SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", TYPENAMES: config["type_name"].presence || "cp:CP.CadastralParcel",
            COUNT: 10, SRSNAME: "EPSG:4326", OUTPUTFORMAT: "application/json",
            # WFS 2.0 with an EPSG URN: axis order latitude, longitude.
            BBOX: [ lat - BOX_DEG, lng - BOX_DEG, lat + BOX_DEG, lng + BOX_DEG ].map { |v| v.round(7) }.join(",") + ",urn:ogc:def:crs:EPSG::4326"
          }
          json = GeoHttp.get_json(url, params:, timeout: 8)
          features = Array(json["features"]).select { |f| f.is_a?(Hash) && f["geometry"].is_a?(Hash) && reference(f).present? }
            .map { |f| f.merge("geometry" => lng_lat(f["geometry"], lng, lat)) }
          feature = containing(features, lng, lat) or return nil

          props = feature["properties"]
          Parcel.new(
            capakey: reference(feature),
            label: I18n.t("map_data.parcels.lu_label", number: props["label"].presence || reference(feature)),
            detail: square_meters(props["area"]),
            geometry: feature["geometry"], lng:, lat:
          )
        end

        def reference(feature)
          props = feature["properties"].to_h
          (props["national_cadastral_reference"].presence || props["inspireid_identifier_localid"].presence).to_s
        end

        # Some servers answer latitude first for EPSG:4326: swap the axes
        # when the first coordinate is closer to the latitude of the click.
        def lng_lat(geometry, lng, lat)
          first = first_position(geometry["coordinates"]) or return geometry
          return geometry unless (first[0] - lat).abs < (first[0] - lng).abs

          geometry.merge("coordinates" => swap(geometry["coordinates"]))
        end

        def first_position(coordinates)
          coordinates = coordinates.first while coordinates.is_a?(Array) && coordinates.first.is_a?(Array)
          coordinates.is_a?(Array) && coordinates.size >= 2 ? coordinates.map(&:to_f) : nil
        end

        def swap(coordinates)
          return [ coordinates[1], coordinates[0], *coordinates[2..] ] unless coordinates.first.is_a?(Array)
          coordinates.map { |c| swap(c) }
        end
    end
  end
end
