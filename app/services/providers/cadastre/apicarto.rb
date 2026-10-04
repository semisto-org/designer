module Providers
  class Cadastre
    # French cadastre (DGFiP PCI, Licence Ouverte 2.0) through the IGN API
    # Carto: GET /api/cadastre/parcelle?geom=<GeoJSON point> answers the
    # parcel's GeoJSON with idu, section, numero, nom_com, contenance (m²).
    class Apicarto < Adapter
      private
        def find(lng, lat)
          geom = { type: "Point", coordinates: [ lng.round(7), lat.round(7) ] }.to_json
          json = GeoHttp.get_json(url, params: { geom: }, headers: { "Accept" => "application/json" }, timeout: 8)
          features = Array(json["features"]).select { |f| f.is_a?(Hash) && f.dig("properties", "idu").present? && f["geometry"].is_a?(Hash) }
          feature = containing(features, lng, lat) or return nil

          props = feature["properties"]
          Parcel.new(
            capakey: props["idu"].to_s,
            label: I18n.t("map_data.parcels.fr_label", section: props["section"].to_s.sub(/\A0+(?=.)/, ""), number: props["numero"].to_s.sub(/\A0+(?=.)/, "")),
            detail: [ props["nom_com"].presence, square_meters(props["contenance"]) ].compact.join(" · ").presence,
            geometry: feature["geometry"], lng:, lat:
          )
        end
    end
  end
end
