# `return_to` reduced to a path on this site, or nil: the way back to the
# exact place a person left (a locked panel, a read-only map) after paying.
module SafeReturnPath
  extend ActiveSupport::Concern

  private
    def safe_return_path
      value = params[:return_to].to_s
      value if value.start_with?("/") && !value.start_with?("//") && !value.include?("\\") && value.length <= 500
    end
end
