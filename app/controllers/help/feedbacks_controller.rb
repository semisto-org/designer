# « Ce guide t'a aidé ? » at the bottom of a help article: the answer is
# saved at once; the optional « Qu'est-ce qui manquait ? » comes after, with
# the signed token the first answer returned. Public, like the help center.
module Help
  class FeedbacksController < ApplicationController
    allow_unauthenticated_access
    rate_limit to: 20, within: 10.minutes, with: -> { render json: { message: t("help.feedback.too_many") }, status: :too_many_requests }

    TOKEN_PURPOSE = :help_feedback

    def create
      resume_session
      feedback = HelpFeedback.new(slug: params[:slug], helpful: ActiveModel::Type::Boolean.new.cast(params[:helpful]), user: Current.user)
      if feedback.save
        render json: { token: feedback.signed_id(purpose: TOKEN_PURPOSE, expires_in: 1.hour) }, status: :created
      else
        render json: { message: feedback.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end

    def update
      feedback = HelpFeedback.find_signed(params[:token], purpose: TOKEN_PURPOSE)
      return render(json: { message: t("help.feedback.expired") }, status: :not_found) unless feedback
      if feedback.update(comment: params[:comment].to_s.strip.presence)
        head :no_content
      else
        render json: { message: feedback.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end
  end
end
