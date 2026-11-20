# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
# (app/frontend/utils/map_geoportail.js: FORMATTERS, formatResults,
# parcelNumber, pixelValue), moved server side and translated through I18n.
#
# Each formatter turns the raw `results` of an ArcGIS REST identify into
# displayable entries { text:, detail:, href:, href_label: }. The key is the
# layer's `options.identify.formatter` (defaults to the layer key). Values
# come from a third party: they are plain text, links are kept only in
# https, and everything is length-capped. The browser renders them as text.
module Providers
  class ArcgisIdentify
    module Formatters
      MAX_ENTRIES = 20
      MAX_TEXT = 300

      LANDSCAPE = %w[woody grassy water stony].freeze
      # Belgian parcel reference: division, section, radical/bis, exponent,
      # power (« 21444B0021/00S008 »; « _ » when there is no exponent).
      CAPAKEY = %r{\A\d{5}(?<section>[A-Z])(?<radical>\d{4})/(?<bis>\d{2})(?<exposant>[A-Z_])(?<puissance>\d{3})\z}
      # The FEE rasters: each description field, with the numbered level the
      # Fichier écologique reads (two neighbouring levels can share a name).
      ESSENCES_FIELDS = { "NT_DESC" => "NIVEAUX_TROPHIQUES", "NH_DESC" => "NIVEAUX_HYDRIQUES", "SS_DESC" => nil, "AE_DESC" => nil }.freeze

      module_function

      # Entries for one layer, de-duplicated (neighbouring polygons often
      # say the same thing) and capped.
      def entries_for(formatter, results)
        results = Array(results).select { |r| r.is_a?(Hash) }
        method = "format_#{formatter}"
        entries = respond_to?(method, true) ? send(method, results) : default(results)
        seen = Set.new
        entries.compact.filter_map { |entry| sanitize(entry) }.select do |entry|
          seen.add?("#{entry[:text]}|#{entry[:detail]}")
        end.first(MAX_ENTRIES)
      end

      # « 247X9 », « 12/2A »: radical without leading zeros, bis, exponent
      # letter, power.
      def parcel_number(attributes)
        trimmed = ->(value) { value.to_s.strip.sub(/\A0+/, "") }
        number = trimmed.(attributes["Radical"])
        number += "/#{trimmed.(attributes["Bis"])}" if trimmed.(attributes["Bis"]).present?
        number += attributes["Exposant"].to_s.strip if present?(attributes["Exposant"])
        number += trimmed.(attributes["Puissance"]) if trimmed.(attributes["Puissance"]).present?
        number
      end

      # Raster pixel value (« Stretch.Pixel Value »), nil outside coverage.
      def pixel_value(attributes)
        raw = attributes["Stretch.Pixel Value"] || attributes["Pixel Value"]
        return nil if !present?(raw) || raw.to_s == "NoData"
        Float(raw.to_s.tr(",", "."))
      rescue ArgumentError
        nil
      end

      def present?(value)
        !value.nil? && value.to_s.strip != "" && value.to_s != "Null"
      end

      # -- per layer ---------------------------------------------------------

      def format_sols(results)
        results.map do |result|
          a = attrs(result)
          sigle = a["Sigle pédologique repris sur la carte"]
          next entry(result["layerName"]) unless present?(sigle)
          # The SPW spells it « Définiton »: match the key by its start.
          definition = a.find { |k, _| k.start_with?("Défini") }&.last
          stones = a["Pourcentage estimé de la charge caillouteuse en surface"]
          entry(t("sols.title", sigle:),
            detail: join(present?(definition) ? definition : nil,
                         present?(stones) ? t("sols.stones", value: stones) : nil),
            href: a["Lien vers la fiche de synthèse de la légende"], href_label: t("sols.link"))
        end
      end

      def format_natura2000(results)
        results.map do |result|
          a = attrs(result)
          if present?(a["CODE_UG"])
            entry("#{a["ET_CODE_UG_FR"].presence || a["ET_CODE_UG"]} — #{a["DESC_UG_FR"].presence || a["DESC_UG"]}",
              href: a["LIEN_UG"], href_label: t("natura2000.unit_link"))
          else
            entry(t("natura2000.site", name: a["NOM_FR"].presence || a["NOM"], code: a["CODE_SITE"]),
              href: a["LIEN_SITE"], href_label: t("natura2000.site_link"))
          end
        end
      end

      def format_parcellaire_agricole(results)
        results.map do |result|
          a = attrs(result)
          if present?(a["CULT_NOM"])
            details = [ t("parcellaire_agricole.declared", value: decimal(a["DECLARED"], 2)),
                        t("parcellaire_agricole.campaign", year: a["CAMPAGNE"]) ]
            details << t("parcellaire_agricole.organic") if a["ORGANIC"].to_s == "1"
            entry(a["CULT_NOM"], detail: details.join(" · "))
          else
            kind = a["LANDSCAPE"].to_s
            label = LANDSCAPE.include?(kind) ? t("parcellaire_agricole.landscape.#{kind}") : kind
            entry(result["layerName"], detail: present?(label) ? t("parcellaire_agricole.element", kind: label) : nil)
          end
        end
      end

      def format_cadastre(results)
        results.map { |result| cadastre_entry(attrs(result)) }
      end

      def cadastre_entry(a)
        a = cadastre_attributes(a)
        entry(t("cadastre.title", number: parcel_number(a), section: a["Section"]),
          detail: join(a["Nom Division"].to_s.split("/").first.to_s.strip, a["CAPAKEY"]))
      end

      # The SPW layer (Wallonia) splits the parcel number into fields; the
      # federal CadGIS layer (SPF Finances, Brussels) only gives `CaPaKey`:
      # derive the same fields from it.
      def cadastre_attributes(a)
        return a if present?(a["CAPAKEY"]) || !present?(a["CaPaKey"])

        capakey = a["CaPaKey"].to_s.strip
        match = CAPAKEY.match(capakey)
        return a.merge("CAPAKEY" => capakey) unless match

        a.merge("CAPAKEY" => capakey, "Section" => match[:section], "Radical" => match[:radical], "Bis" => match[:bis],
                "Exposant" => (match[:exposant] unless match[:exposant] == "_"), "Puissance" => match[:puissance])
      end

      def format_courbes(results)
        results.filter_map { |r| pixel_value(attrs(r)) }
          .map { |value| entry(t("courbes.title", value: decimal(value, 1)), detail: t("courbes.detail")) }
      end

      def format_pentes(results)
        results.filter_map { |r| pixel_value(attrs(r)) }
          .map { |value| entry(t("pentes.title", value: decimal(value, 0)), detail: t("pentes.detail")) }
      end

      def format_ruissellement(results)
        results.map do |result|
          a = attrs(result)
          if present?(a["NOMA"])
            entry([ a["NOMB"], title_case(a["NOMA"]) ].select { |v| present?(v) }.join(" "), detail: result["layerName"])
          elsif present?(a["arcid"])
            entry(t("ruissellement.axis"), detail: t("ruissellement.axis_detail"))
          else
            entry(result["layerName"])
          end
        end
      end

      def format_essences(results)
        results.flat_map do |result|
          a = attrs(result)
          ESSENCES_FIELDS.filter_map do |field, level_field|
            value = a["Raster.#{field}"] || a[field]
            next unless present?(value)

            level = level_field && (a["Raster.#{level_field}"] || a[level_field])
            value = value.to_s.strip
            value = t("essences.with_level", level: level.to_s.strip.tr("-", "−"), value:) if present?(level)
            entry(t("essences.line", label: t("essences.#{field.downcase}"), value:))
          end
        end
      end

      def format_zones_bioclimatiques(results)
        results.filter_map do |result|
          name = attrs(result)["NOM"] || result["value"]
          entry(t("zones_bioclimatiques.title", name: name.to_s.strip), detail: t("zones_bioclimatiques.detail")) if present?(name)
        end
      end

      # Raster attribute or vector field, whichever the layer gives.
      def field(a, name) = a["Raster.#{name}"] || a[name]

      FIRE_CLASSES = { "Low" => "low", "Medium low" => "medium_low", "Medium hi" => "medium_high", "High" => "high" }.freeze

      def format_alea_incendie(results)
        results.filter_map do |result|
          key = FIRE_CLASSES[field(attrs(result), "FIRE_PROBA").to_s.strip]
          entry(t("alea_incendie.title", value: t("alea_incendie.classes.#{key}")), detail: t("alea_incendie.detail")) if key
        end
      end

      def format_alea_inondation(results)
        results.filter_map do |result|
          a = attrs(result)
          value = field(a, "VALEUR")
          next unless present?(value)
          kind = field(a, "TYPEALEA")
          entry(present?(kind) ? t("alea_inondation.title_kind", value:, kind: kind.to_s.downcase) : capitalize(value),
            detail: t("alea_inondation.detail"))
        end
      end

      def format_zones_inondees_2021(results)
        results.map { |result| entry(t("zones_inondees_2021.title"), detail: result["layerName"].to_s.sub(/\AZones? ind?ondées\s*-\s*/i, "")) }
      end

      def format_sensibilite_erosion(results)
        results.filter_map do |result|
          value = field(attrs(result), "CLASSE_DES")
          entry(t("sensibilite_erosion.title", value: value.to_s.strip.downcase)) if present?(value)
        end
      end

      def format_erosion_diffuse(results)
        results.filter_map do |result|
          value = field(attrs(result), "DESCRIPTION")
          next unless present?(value)
          next entry(t("erosion_diffuse.unmapped")) if value.to_s.strip == "non cartographié"
          entry(t("erosion_diffuse.title", value: value.to_s.strip), detail: t("erosion_diffuse.detail"))
        end
      end

      def format_textures_sol(results)
        results.filter_map do |result|
          a = attrs(result)
          sub = a["Raster.Libellé de la sous-classe texturale"]
          next unless present?(sub)
          entry(t("textures_sol.title", value: capitalize(sub.to_s.downcase)), detail: t("textures_sol.detail"))
        end
      end

      def format_cadmium(results)
        results.filter_map do |result|
          a = attrs(result)
          value = a["Teneur probable"]
          next unless present?(value)
          high = a.find { |k, _| k.start_with?("Teneur qui a moins") }&.last
          entry(t("cadmium.title", value:), detail: present?(high) ? t("cadmium.detail", value: high) : nil)
        end
      end

      def format_drigm(results)
        results.map do |result|
          entry(capitalize(result["layerName"]), detail: t("drigm.detail"),
            href: "https://geologie.wallonie.be/home/infosssol/fiss.html", href_label: t("drigm.link"))
        end
      end

      def format_arbres_remarquables(results)
        results.map do |result|
          a = attrs(result)
          name = a["Nom français"]
          latin = [ a["Genre"], a["Espèce"], (present?(a["Cultivar"]) ? "'#{a["Cultivar"]}'" : nil) ].select { |v| present?(v) }.join(" ")
          next entry(t("arbres_remarquables.zone"), detail: (a["Commentaire"] if present?(a["Commentaire"]))) unless present?(name)
          size = [ (t("arbres_remarquables.circumference", value: a["Circonférence"]) if present?(a["Circonférence"])),
                   (t("arbres_remarquables.height", value: a["Hauteur"]) if present?(a["Hauteur"])) ].compact.join(", ")
          entry(join(capitalize(name), latin.presence), detail: join(size.presence, (a["Commentaire"] if present?(a["Commentaire"]))))
        end
      end

      def format_forets_anciennes(results)
        results.map do |result|
          a = attrs(result)
          age = a["Ancienneté de la forêt actuelle"]
          next entry(capitalize(age), detail: a["Classification de la forêt actuelle"]) if present?(age)
          ferraris = a["Description de l'occupation du sol"]
          present?(ferraris) ? entry(capitalize(ferraris), detail: t("forets_anciennes.ferraris")) : entry(result["layerName"])
        end
      end

      def format_plan_secteur(results)
        results.map do |result|
          a = attrs(result)
          # The SPW names the link key « Lien Wallex » with a trailing space.
          wallex = a.find { |k, _| k.strip == "Lien Wallex" }&.last
          text = if present?(a["Phrase carto juridique"]) then capitalize(a["Phrase carto juridique"])
          elsif present?(a["Description"]) then a["Description"]
          else result["layerName"]
          end
          entry(text, detail: present?(a["Article CoDT"]) ? t("plan_secteur.codt", article: a["Article CoDT"]) : nil,
            href: wallex, href_label: t("plan_secteur.link"))
        end
      end

      def default(results)
        results.map { |r| entry(r["value"].presence || r["layerName"]) }
      end

      # -- helpers -----------------------------------------------------------

      def attrs(result)
        result["attributes"].is_a?(Hash) ? result["attributes"] : {}
      end

      def entry(text, detail: nil, href: nil, href_label: nil)
        { text:, detail:, href:, href_label: }
      end

      def sanitize(entry)
        text = clean(entry[:text])
        return nil if text.blank?
        href = entry[:href].to_s.strip
        href = nil unless href.start_with?("https://") && href.length <= 1000
        { text:, detail: clean(entry[:detail]).presence, href:, href_label: href && clean(entry[:href_label]).presence }
      end

      def clean(value)
        value.to_s.gsub(/[[:cntrl:]]+/, " ").squish.truncate(MAX_TEXT)
      end

      def join(*parts)
        parts.select { |p| present?(p) }.map { |p| p.to_s.strip }.join(" · ").presence
      end

      def t(key, **)
        I18n.t("map_data.identify.formatters.#{key}", **)
      end

      def decimal(value, digits)
        ActiveSupport::NumberHelper.number_to_rounded(value.to_s.tr(",", ".").to_f, precision: digits, separator: ",", delimiter: " ")
      end

      def capitalize(text)
        text = text.to_s
        text[0].to_s.upcase + text[1..].to_s
      end

      # « BOCQ » → « Bocq », « RY-DE-VAUX » → « Ry-De-Vaux ».
      def title_case(text)
        text.to_s.downcase.gsub(/(\A|[\s-])(\p{L})/) { "#{$1}#{$2.upcase}" }
      end
    end
  end
end
