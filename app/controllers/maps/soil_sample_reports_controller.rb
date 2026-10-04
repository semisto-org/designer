# The lab report (PDF) of a soil sample: viewers read it (through a short-lived
# link, after the role check), editors attach or remove it.
module Maps
  class SoilSampleReportsController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :require_editor!, except: :show
    before_action :set_sample

    def show
      return render(json: { message: t("soil.errors.report_missing") }, status: :not_found) unless @sample.lab_report.attached?
      expires_in 4.minutes, private: true
      redirect_to @sample.lab_report.url(expires_in: 5.minutes, disposition: params[:download].present? ? :attachment : :inline), allow_other_host: true
    end

    def create
      file = params.dig(:soil_sample, :lab_report)
      @sample.lab_report.attach(file) if file.respond_to?(:original_filename)
      if @sample.valid?
        @sample.save!
        render json: @sample.as_inertia(analyses: map_entitlements.analyses?)
      else
        @sample.lab_report.detach
        render_errors @sample
      end
    end

    def destroy
      @sample.lab_report.purge_later
      render json: @sample.reload.as_inertia(analyses: map_entitlements.analyses?).merge(hasReport: false, reportFilename: nil)
    end

    private
      def set_sample
        @sample = @map.soil_samples.find(params[:soil_sample_id])
      end
  end
end
