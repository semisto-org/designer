class ObservedClimate
  # One step of the computation of a cell, run by ObservedClimateJob until
  # it is done: submit the CDS job, then poll it, then download the hourly
  # series and compute the indicators. #step returns the delay before the
  # next step, or nil when the record is ready or failed.
  class Fetch
    MAX_ATTEMPTS = 90 # about three hours of polling
    WAITS = [ 20.seconds, 30.seconds, 60.seconds, 90.seconds ].freeze
    MAX_WAIT = 2.minutes

    def initialize(record, provider: Providers::Era5Land.from_env)
      @record = record
      @provider = provider
    end

    def step
      return nil unless @record.pending?
      return failed("CDS_API_KEY is not set") unless @provider.configured?

      @record.increment!(:attempts, touch: true)
      return failed("gave up after #{MAX_ATTEMPTS} attempts") if @record.attempts > MAX_ATTEMPTS

      @record.job_id.blank? ? submit : poll
    rescue Providers::Era5Land::ClientError => e
      failed(e.message)
    rescue Providers::Era5Land::Error => e
      Rails.logger.warn("[observed_climate] cell #{@record.cell}: #{e.message}")
      wait
    end

    private
      def submit
        id = @provider.submit(lat: @record.cell_lat, lng: @record.cell_lng, first_year: @record.first_year, last_year: @record.last_year)
        @record.update!(job_id: id, submitted_at: Time.current)
        wait
      end

      def poll
        job = @provider.job(@record.job_id)
        case job.status
        when :successful then compute
        when :failed then failed(job.message || "the CDS job failed")
        else wait
        end
      end

      def compute
        Tempfile.create([ "era5-land", ".bin" ], binmode: true) do |file|
          @provider.download(@record.job_id, file)
          file.flush
          series = HourlySeries.new(first_year: @record.first_year, last_year: @record.last_year).read_file(file.path)
          indicators = Indicators.new(series.days).as_json
          return failed("no complete year in the series") if indicators[:years].zero?

          @record.update!(status: "ready", indicators:, computed_at: Time.current, error: nil)
        end
        nil
      end

      def failed(message)
        Rails.logger.warn("[observed_climate] cell #{@record.cell} failed: #{message}")
        @record.fail!(message)
        nil
      end

      def wait = WAITS[@record.attempts - 1] || MAX_WAIT
  end
end
