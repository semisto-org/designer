# The lab reports (PDFs) of a soil sample, one per analysis (standard,
# heavy metals…): viewers read them (through a short-lived link, after the
# role check), editors attach or remove them.
module Maps
  class SoilSampleReportsController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :require_editor!, except: :show
    before_action :set_sample
    before_action :set_report, only: %i[show destroy]

    def show
      expires_in 4.minutes, private: true
      redirect_to stored_file_url(@report, expires_in: 5.minutes, disposition: params[:download].present? ? :attachment : :inline), allow_other_host: true
    end

    # One or several PDFs (soil_sample[lab_reports][]), all kept or none.
    def create
      files = Array(params.dig(:soil_sample, :lab_reports)).select { |file| file.respond_to?(:original_filename) }
      return render(json: { message: t("soil.errors.report_missing") }, status: :unprocessable_entity) if files.empty?
      usage = StorageUsage.for_map(@map)
      return render(json: { message: StorageUsage.full_message(usage) }, status: :unprocessable_entity) unless usage.allows?(files.sum(&:size))
      before = @sample.lab_reports.map(&:id)
      if @sample.lab_reports.attach(files)
        render json: @sample.reload.as_inertia(analyses: map_entitlements.analyses?), status: :created
      else
        errors = @sample.errors.dup
        @sample.lab_reports.reject { |report| before.include?(report.id) }.each { |report| report.blob.purge_later if report.blob.persisted? }
        @sample.errors.merge!(errors)
        render_errors @sample
      end
    end

    def destroy
      @report.purge_later
      render json: @sample.reload.as_inertia(analyses: map_entitlements.analyses?)
    end

    private
      def set_sample
        @sample = @map.soil_samples.find(params[:soil_sample_id])
      end

      def set_report
        @report = @sample.lab_reports.find_by(id: params[:id]) or
          render(json: { message: t("soil.errors.report_missing") }, status: :not_found)
      end
  end
end
