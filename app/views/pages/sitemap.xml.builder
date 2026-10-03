xml.instruct!
xml.urlset xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9" do
  @urls.each do |path, priority|
    xml.url do
      xml.loc "#{request.base_url}#{path}"
      xml.priority priority
    end
  end
end
