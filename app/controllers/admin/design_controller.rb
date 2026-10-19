# Super admin « Design »: the shared « carnet » primitives of
# app/frontend/components/ui shown live with their states, and what remains
# to migrate according to the design guard (script/design_lint.mjs).
module Admin
  class DesignController < BaseController
    def show
      render inertia: "admin/design/show", props: { guard: Admin::DesignGuard.call }
    end
  end
end
