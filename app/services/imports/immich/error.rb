module Imports
  module Immich
    # An import that cannot go on, worded in French for the person running it
    # (immich_import.errors.* in config/locales/immich_import.fr.yml).
    class Error < StandardError
      attr_reader :key

      def initialize(key, **values)
        @key = key
        super(I18n.t("immich_import.errors.#{key}", **values))
      end
    end
  end
end
