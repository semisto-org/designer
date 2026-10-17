# POST /eco_measurements: the « EcoIndex » workflow sends what it measured
# after a deployment (script/ecoindex.mjs). Authorised by the shared secret
# ECOINDEX_TOKEN (Authorization: Bearer …); without it the endpoint does not
# exist. The server computes score and grade from the raw counts.
class EcoMeasurementsController < ActionController::API
  include ActionController::HttpAuthentication::Token::ControllerMethods

  before_action :authorize!

  def create
    rows = Array(params.require(:measurements)).map do |row|
      EcoMeasurement.new(row.permit(:screen, :environment, :url, :dom_elements, :requests, :bytes, :measured_at)
        .merge(commit: params[:commit].presence))
    end
    invalid = rows.reject(&:valid?)
    return render(json: { errors: invalid.map { |row| row.errors.full_messages } }, status: :unprocessable_entity) if invalid.any?
    EcoMeasurement.transaction { rows.each(&:save!) }
    render json: { saved: rows.size, screens: rows.map { |row| { screen: row.screen, score: row.score, grade: row.grade } } }, status: :created
  end

  private
    def authorize!
      expected = ENV["ECOINDEX_TOKEN"].to_s
      return head(:not_found) if expected.empty?
      authenticate_or_request_with_http_token do |token, _|
        ActiveSupport::SecurityUtils.secure_compare(token, expected)
      end
    end
end
