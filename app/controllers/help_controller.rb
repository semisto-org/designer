# The help center: Markdown articles from app/help, public. /help/:slug.json
# returns one article as JSON for the help drawer (components/help/HelpDrawer).
class HelpController < ApplicationController
  include PublicMeta

  allow_unauthenticated_access

  def index
    query = params[:q].to_s.strip.first(100)
    results = query.present? ? HelpArticle.search(query) : []
    words = HelpArticle.tokenize(query)
    render_public "help/index", page: :help, props: {
      query:,
      categories: HelpArticle.categories.map { |c| { name: c[:name], articles: c[:articles].map(&:as_json) } },
      results: results.map { |a| a.as_json.merge(excerpt: a.excerpt(words)) }
    }
  end

  def show
    article = HelpArticle.find(params[:slug])
    respond_to do |format|
      format.html do
        return redirect_to(help_center_path, alert: t("help.not_found")) unless article
        siblings = HelpArticle.all.select { |a| a.category == article.category && a != article }
        render_public "help/show", page: :help, title: article.title, description: article.summary, props: {
          article: article.to_drawer_json,
          related: siblings.map(&:as_json)
        }
      end
      format.json do
        article ? render(json: article.to_drawer_json) : render(json: { message: t("help.not_found") }, status: :not_found)
      end
    end
  end
end
