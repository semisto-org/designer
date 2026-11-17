module Imports
  module MySemisto
    # An import that cannot go on, worded in French for the person running it
    # (my_semisto_import.errors.* in config/locales/my_semisto_import.fr.yml).
    class Error < StandardError
      attr_reader :key

      def initialize(key, **values)
        @key = key
        super(I18n.t("my_semisto_import.errors.#{key}", **values))
      end
    end
  end
end
