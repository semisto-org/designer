# Staff: what readers say about the help center. The guides that helped
# least, the latest « Qu'est-ce qui manquait ? », and the searches that
# found nothing (the guides still to write).
module Admin
  class HelpController < BaseController
    def show
      tally = HelpFeedback.tally
      articles = HelpArticle.all.map do |article|
        counts = tally[article.slug]
        article.as_json.merge(helpful: counts[:helpful], unhelpful: counts[:unhelpful])
      end
      render inertia: "admin/help/show", props: {
        articles: articles.sort_by { |a| [ -(a[:unhelpful] - a[:helpful]), -(a[:helpful] + a[:unhelpful]), a[:title] ] },
        comments: HelpFeedback.where.not(comment: nil).newest_first.includes(:user).limit(50).map { |f| comment_json(f) },
        misses: HelpSearchMiss.most_searched.limit(100).map { |m| { id: m.id, query: m.query, count: m.count, lastSearchedAt: m.last_searched_at.iso8601 } }
      }
    end

    # A miss answered by a new guide (or noise) is cleared from the list.
    def destroy_miss
      HelpSearchMiss.where(id: params[:id]).delete_all
      redirect_to admin_help_path, notice: t("help.admin.miss_cleared"), status: :see_other
    end

    private
      def comment_json(feedback)
        article = HelpArticle.find(feedback.slug)
        { id: feedback.id, slug: feedback.slug, title: article&.title || feedback.slug, helpful: feedback.helpful,
          comment: feedback.comment, author: feedback.user&.email_address, createdAt: feedback.created_at.iso8601 }
      end
  end
end
