# Super admin « Tech »: the version online, files and their backup, background
# jobs and the external services (Admin::Tech).
module Admin
  class TechController < BaseController
    def show
      render inertia: "admin/tech/show", props: { tech: Admin::Tech.call }
    end
  end
end
