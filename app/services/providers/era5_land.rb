# Hourly ERA5-Land reanalysis at one point, from the Copernicus Climate Data
# Store (CDS), dataset "reanalysis-era5-land-timeseries" (ARCO time series,
# 0.1° grid, ~9 km; the CDS picks the nearest grid point). Licence CC BY 4.0;
# attribution "Contains modified Copernicus Climate Change Service
# information <year>" shown next to every value derived from it.
#
# The CDS Retrieve API follows OGC API Processes and is asynchronous: a
# request becomes a job that waits in a queue, then runs (minutes):
#
#   POST {url}/retrieve/v1/processes/<dataset>/execution  { inputs: {...} } -> { jobID, status }
#   GET  {url}/retrieve/v1/jobs/<id>                      -> { status: accepted|running|successful|failed|rejected|dismissed }
#   GET  {url}/retrieve/v1/jobs/<id>/results              -> { asset: { value: { href, type, file:size } } }
#   GET  <href>                                           -> the file (CSV, or a zip of CSVs)
#
# Every call carries the personal access token in the PRIVATE-TOKEN header.
# The account behind the token must have accepted the dataset's licence
# (CC BY 4.0) once on the CDS website, or submissions are refused.
#
#   era5 = Providers::Era5Land.from_env
#   era5.configured?                       # false without CDS_API_KEY
#   id = era5.submit(lat: 50.3, lng: 4.9, first_year: 1995, last_year: 2024)
#   era5.job(id).status                    # :pending | :running | :successful | :failed
#   era5.download(id, io)                  # streams the result file into io
#
# Configured by ENV: CDS_API_KEY (personal access token), CDS_API_URL
# (default https://cds.climate.copernicus.eu/api).
module Providers
  class Era5Land
    class Error < StandardError; end
    # The CDS refused the request itself (bad token, licence not accepted,
    # invalid request): retrying soon would not help.
    class ClientError < Error; end

    DATASET = "reanalysis-era5-land-timeseries".freeze
    DEFAULT_URL = "https://cds.climate.copernicus.eu/api".freeze
    VARIABLES = %w[2m_temperature total_precipitation].freeze
    GRID_STEP = 0.1
    MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024
    STATUSES = {
      "accepted" => :pending, "running" => :running, "successful" => :successful,
      "failed" => :failed, "rejected" => :failed, "dismissed" => :failed, "deleted" => :failed
    }.freeze
    ATTRIBUTION = {
      key: "era5_land",
      publisher: "Copernicus Climate Change Service (C3S)",
      title: "ERA5-Land hourly time-series data from 1950 to present",
      licence: "CC BY 4.0",
      url: "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-timeseries",
      doi: "10.24381/ee82e357"
    }.freeze

    Job = Data.define(:id, :status, :message)

    def self.from_env(env = ENV)
      new(api_key: env["CDS_API_KEY"], base_url: env["CDS_API_URL"])
    end

    # The ERA5-Land grid point nearest to a location: [lat, lng] rounded to
    # 0.1°. Maps in the same cell share one computation.
    def self.cell(lat, lng)
      [ (lat.to_f / GRID_STEP).round * GRID_STEP, (lng.to_f / GRID_STEP).round * GRID_STEP ].map { _1.round(1) }
    end

    def initialize(api_key:, base_url: nil, connection: nil)
      @api_key = api_key.presence
      @base_url = (base_url.presence || DEFAULT_URL).chomp("/")
      @connection = connection
    end

    def configured? = @api_key.present?

    def key = "era5_land"

    # Submits the request for the hourly 2 m temperature and precipitation
    # of a grid point over whole years; returns the job id.
    def submit(lat:, lng:, first_year:, last_year:)
      ensure_configured!
      inputs = {
        variable: VARIABLES,
        location: { latitude: lat.to_f.round(1), longitude: lng.to_f.round(1) },
        date: [ "#{first_year}-01-01/#{last_year}-12-31" ],
        data_format: "csv"
      }
      body = request(:post, "retrieve/v1/processes/#{DATASET}/execution", { inputs: }.to_json)
      body["jobID"].presence || raise(Error, "no job id in the answer")
    end

    def job(id)
      ensure_configured!
      body = request(:get, "retrieve/v1/jobs/#{escape(id)}")
      status = STATUSES.fetch(body["status"].to_s) { raise Error, "unknown job status #{body['status'].inspect}" }
      message = status == :failed ? failure_message(id) : nil
      Job.new(id:, status:, message:)
    end

    # Streams the result file of a successful job into io (binary). Returns
    # the asset's media type ("text/csv", "application/zip"...).
    def download(id, io)
      ensure_configured!
      asset = request(:get, "retrieve/v1/jobs/#{escape(id)}/results").dig("asset", "value")
      href = asset&.dig("href").presence or raise Error, "no asset in the results"
      url = URI.join("#{@base_url}/", href).to_s
      written = 0
      response = connection.get(url) do |req|
        req.headers.delete("PRIVATE-TOKEN") unless same_host?(url)
        req.options.timeout = 300
        req.options.on_data = proc do |chunk, _total|
          written += chunk.bytesize
          raise Error, "result file too large" if written > MAX_DOWNLOAD_BYTES
          io.write(chunk)
        end
      end
      raise Error, "download HTTP #{response.status}" unless response.status.between?(200, 299)

      asset["type"].presence || response.headers["Content-Type"]
    rescue Faraday::Error => e
      raise Error, "download failed: #{e.class}"
    end

    private
      def ensure_configured!
        raise Error, "CDS_API_KEY is not set" unless configured?
      end

      def escape(id) = ERB::Util.url_encode(id.to_s)

      def same_host?(url) = URI.parse(url).host == URI.parse(@base_url).host

      def request(method, path, body = nil)
        response = connection.run_request(method, "#{@base_url}/#{path}", body, body ? { "Content-Type" => "application/json" } : {})
        parsed = parse(response.body)
        unless response.status.between?(200, 299)
          detail = parsed.is_a?(Hash) ? (parsed["detail"].presence || parsed["title"]) : nil
          message = "HTTP #{response.status}#{": #{detail.to_s[0, 300]}" if detail}"
          raise ClientError, message if response.status.between?(400, 499) && ![ 408, 429 ].include?(response.status)
          raise Error, message
        end
        raise Error, "unexpected answer" unless parsed.is_a?(Hash)
        parsed
      rescue Faraday::Error => e
        raise Error, "#{e.class}: #{e.message.to_s[0, 200]}"
      end

      def parse(body)
        body.is_a?(String) ? JSON.parse(body) : body
      rescue JSON::ParserError
        nil
      end

      # A failed job's results carry the error (title, detail, traceback).
      def failure_message(id)
        body = connection.get("#{@base_url}/retrieve/v1/jobs/#{escape(id)}/results")
        parsed = parse(body.body)
        parsed.is_a?(Hash) ? [ parsed["title"], parsed["detail"] ].compact_blank.join(": ")[0, 300].presence : nil
      rescue Faraday::Error
        nil
      end

      def connection
        @connection ||= Faraday.new(request: { open_timeout: 5, timeout: 20 }) do |f|
          f.headers["User-Agent"] = GeoHttp::USER_AGENT
          f.headers["Accept"] = "application/json"
          f.headers["PRIVATE-TOKEN"] = @api_key if @api_key
        end
      end
  end
end
