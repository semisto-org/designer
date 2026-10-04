module Billing
  # Turns the free-text billing address of an invoice request into Stripe's
  # address fields, and recognises EU VAT numbers. The form asks for one
  # multi-line address, as a commune writes it on a purchase order:
  #
  #   Administration communale de Yvoir
  #   Rue de l'Hôtel de Ville 1
  #   5530 Yvoir
  #   Belgique
  #
  # The last line is the country when it names one; the line with a postal
  # code gives postal_code and city; the rest is line1/line2. Without a
  # country line, the VAT number's prefix decides, then Belgium. Stripe Tax
  # only needs the country for EU customers.
  module InvoiceAddress
    DEFAULT_COUNTRY = "BE"

    # Country names (lower case, without accents) as people write them.
    COUNTRIES = {
      "belgique" => "BE", "belgie" => "BE", "belgium" => "BE", "belgien" => "BE",
      "france" => "FR", "luxembourg" => "LU", "pays-bas" => "NL", "nederland" => "NL", "netherlands" => "NL",
      "allemagne" => "DE", "deutschland" => "DE", "germany" => "DE", "suisse" => "CH", "switzerland" => "CH",
      "espagne" => "ES", "italie" => "IT", "portugal" => "PT", "autriche" => "AT", "irlande" => "IE"
    }.freeze

    # Two-letter codes accepted as a country line on their own ("BE").
    COUNTRY_CODES = (COUNTRIES.values + %w[GR DK SE FI PL CZ SK HU RO BG HR SI EE LV LT MT CY GB]).uniq.freeze

    # Postal code prefixes written before the code ("B-5530", "F-59000").
    POSTAL_PREFIXES = { "B" => "BE", "BE" => "BE", "F" => "FR", "FR" => "FR", "L" => "LU", "LU" => "LU",
                        "NL" => "NL", "D" => "DE", "DE" => "DE", "CH" => "CH" }.freeze

    POSTAL_LINE = /\A(?:(?<prefix>[A-Z]{1,2})\s?-\s?)?(?<code>\d{4}\s?[A-Z]{2}|\d{4,5})\s+(?<city>.+)\z/i

    # EU VAT numbers: country prefix + national part (Greece uses "EL").
    EU_VAT = /\A(?:BE[01]\d{9}|(?:AT|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)[0-9A-Z]{8,12})\z/

    module_function

    # { line1:, line2:, postal_code:, city:, country: } (nil fields left out).
    def parse(text, organization_name: nil, company_number: nil)
      lines = text.to_s.lines.map(&:squish).compact_blank
      lines.shift if lines.size > 1 && organization_name.present? && lines.first.casecmp?(organization_name.squish)
      country = lines.size > 1 ? country_code(lines.last) : nil
      lines.pop if country

      postal_index = lines.rindex { |line| line.match?(POSTAL_LINE) }
      postal = postal_index && lines.delete_at(postal_index).match(POSTAL_LINE)
      country ||= postal && POSTAL_PREFIXES[postal[:prefix].to_s.upcase]
      country ||= vat_country(company_number) || DEFAULT_COUNTRY

      {
        line1: lines.first.presence || (postal && postal[0]),
        line2: lines.drop(1).join(", ").presence,
        postal_code: postal && postal[:code].upcase,
        city: postal && postal[:city],
        country:
      }.compact
    end

    # "BE 0123.456.789" → "BE0123456789" when it is an EU VAT number, else nil.
    def eu_vat(number)
      compact = number.to_s.upcase.gsub(/[^0-9A-Z]/, "")
      compact.match?(EU_VAT) ? compact : nil
    end

    def vat_country(number)
      vat = eu_vat(number) or return nil
      prefix = vat[0, 2]
      prefix == "EL" ? "GR" : prefix
    end

    def country_code(line)
      key = I18n.transliterate(line.to_s).downcase.delete(".").squish
      return key.upcase if key.match?(/\A[a-z]{2}\z/) && COUNTRY_CODES.include?(key.upcase)
      COUNTRIES[key]
    end
  end
end
