# The « charte graphique » of the documents a pro account or a team sends:
# its colours, its fonts, a cover image and a footer with its contacts,
# around the logo it already has (HasLogo). The offer (on screen, in PDF and
# in Word) and the map's Markdown documents follow it. Semisto's own charter
# is the default, field by field: a field left empty falls back to it.
#
# Fonts come from a short list of free fonts served by Terranova itself
# (@fontsource-variable, SIL Open Font License): a paid font cannot travel
# with a PDF printed in a browser, nor be licensed for every client.
class DocumentTheme
  COLOR = /\A#[0-9a-f]{6}\z/i
  MAX_FOOTER = 600

  # key => [CSS family served by Terranova, family name for Word, kind]
  FONTS = {
    "eb_garamond" => [ "EB Garamond Variable", "EB Garamond", "serif" ],
    "cormorant_garamond" => [ "Cormorant Garamond Variable", "Cormorant Garamond", "serif" ],
    "lora" => [ "Lora Variable", "Lora", "serif" ],
    "fraunces" => [ "Fraunces Variable", "Fraunces", "serif" ],
    "source_serif" => [ "Source Serif 4 Variable", "Source Serif 4", "serif" ],
    "merriweather" => [ "Merriweather Variable", "Merriweather", "serif" ],
    "playfair" => [ "Playfair Display Variable", "Playfair Display", "serif" ],
    "inter" => [ "Inter Variable", "Inter", "sans" ],
    "work_sans" => [ "Work Sans Variable", "Work Sans", "sans" ],
    "dm_sans" => [ "DM Sans Variable", "DM Sans", "sans" ],
    "nunito_sans" => [ "Nunito Sans Variable", "Nunito Sans", "sans" ],
    "open_sans" => [ "Open Sans Variable", "Open Sans", "sans" ],
    "montserrat" => [ "Montserrat Variable", "Montserrat", "sans" ],
    "raleway" => [ "Raleway Variable", "Raleway", "sans" ]
  }.freeze

  # Semisto's charter (docs/design-system): plum titles, artichoke accents,
  # ink text, EB Garamond and Inter.
  DEFAULTS = {
    "heading_color" => "#3c3956", "accent_color" => "#4d5500", "text_color" => "#36342f",
    "heading_font" => "eb_garamond", "body_font" => "inter", "footer" => nil
  }.freeze
  FIELDS = DEFAULTS.keys.freeze

  # Whose charter a map's documents wear: its team, else its owner.
  def self.holder_for(map) = map.organization || map.owner

  def self.for_map(map) = new(holder_for(map))

  # Only the fields that are valid and differ from nothing: colours as
  # #rrggbb, fonts from the list, the footer as plain text.
  def self.normalize(raw)
    raw = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw.to_h
    raw = raw.transform_keys(&:to_s)
    FIELDS.each_with_object({}) do |field, out|
      value = raw[field]
      value = value.to_s.strip.presence
      next unless value
      case field
      when /_color\z/ then out[field] = value.downcase if value.match?(COLOR)
      when /_font\z/ then out[field] = value if FONTS.key?(value)
      when "footer" then out[field] = value.gsub("\r\n", "\n").first(MAX_FOOTER)
      end
    end
  end

  def self.fonts_json
    FONTS.map { |key, (family, docx, kind)| { key:, family:, docx:, kind: } }
  end

  attr_reader :holder

  # overlay: fields laid over the holder's own (a proposal, to preview it).
  def initialize(holder, overlay: nil)
    @holder = holder
    @overlay = overlay
  end

  # The holder's own fields, without Semisto's.
  def own = self.class.normalize((holder&.document_theme || {}).merge(@overlay.to_h))

  def values = DEFAULTS.merge(own)

  def [](field) = values[field.to_s]

  def css_family(field) = FONTS.fetch(self[field])[0]
  def docx_family(field) = FONTS.fetch(self[field])[1]

  def logo_url = holder&.logo_url
  def cover_url = holder&.document_cover_url

  def name
    case holder
    when Organization then holder.name
    when User then holder.display_name
    end
  end

  # What the pages and the MCP read.
  def as_json(*)
    v = values
    {
      headingColor: v["heading_color"], accentColor: v["accent_color"], textColor: v["text_color"],
      headingFont: v["heading_font"], bodyFont: v["body_font"],
      headingFamily: css_family(:heading_font), bodyFamily: css_family(:body_font),
      footer: v["footer"], logoUrl: logo_url, coverUrl: cover_url, name:
    }
  end
end
