# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)

# « Which species is this plant? » from a plant's inspector: one to five photos
# of the same plant go to Pl@ntNet, which answers its most probable species.
# Each candidate is matched to the catalogue (PlantSpecies), and the human
# picks one (« C'est elle ») or refuses all. Nothing is saved here, and the
# photos are not stored: they leave with the request.
#
#   result = PlantIdentification.new(files: params[:images]).run
#   result.candidates   # => [PlantIdentification::Candidate, ...]
#
# Raises Invalid (user-facing French message) for photos we refuse before any
# call, and lets Providers::PlantNet::NotConfigured / Unavailable through.
class PlantIdentification
  CONTENT_TYPES = %w[image/jpeg image/png].freeze
  MAX_BYTES = 10.megabytes
  # Common names shown per candidate: Pl@ntNet can send a dozen of them.
  MAX_COMMON_NAMES = 3

  class Invalid < StandardError; end

  # `species`: the matching catalogue PlantSpecies, or nil when the catalogue
  # does not know the plant yet (it is shown, but cannot be chosen).
  Candidate = Data.define(:latin_name, :authorship, :common_names, :family, :score, :species) do
    def percent = (score * 100).round

    def as_json(*)
      {
        latinName: latin_name, authorship:, commonNames: common_names, family:, score:, percent:,
        species: species && { id: species.id, latinName: species.latin_name, commonName: species.common_name, slug: species.to_param }
      }
    end
  end

  Result = Data.define(:candidates)

  def initialize(files:, provider: Providers::PlantNet.new)
    @files = Array(files).compact_blank
    @provider = provider
  end

  def run
    raise Providers::PlantNet::NotConfigured, "PLANTNET_API_KEY is not set" unless @provider.configured?
    raise Invalid, I18n.t("plantnet.errors.no_images") if @files.empty?
    raise Invalid, I18n.t("plantnet.errors.too_many", max: Providers::PlantNet::MAX_IMAGES) if @files.size > Providers::PlantNet::MAX_IMAGES

    candidates = @provider.identify(@files.map { |file| read(file) })
    matcher = CatalogueMatcher.new
    Result.new(candidates: candidates.map { |candidate| candidate_for(candidate, matcher) })
  end

  private
    # Hash for the provider; the type is read from the bytes, not trusted from
    # the browser.
    def read(file)
      data = file.read.to_s.b
      name = file.original_filename.to_s
      type = Marcel::MimeType.for(StringIO.new(data), name:, declared_type: file.content_type).to_s
      raise Invalid, I18n.t("plantnet.errors.not_a_photo", name:) unless CONTENT_TYPES.include?(type)
      raise Invalid, I18n.t("plantnet.errors.too_large", name:, max: MAX_BYTES / 1.megabyte) if data.bytesize > MAX_BYTES

      { io: StringIO.new(data), filename: name, content_type: type }
    end

    def candidate_for(candidate, matcher)
      Candidate.new(
        latin_name: candidate.latin_name, authorship: candidate.authorship,
        common_names: candidate.common_names.first(MAX_COMMON_NAMES), family: candidate.family,
        score: candidate.score, species: matcher.match(candidate.latin_name)
      )
    end
end
