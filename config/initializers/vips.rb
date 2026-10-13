# libvips keeps the results of recent operations in a cache (up to 100 MB by
# default), decoded images included. On the production server (768 MB for
# Puma, its job workers and any rake task) that cache is memory we cannot
# spare: photos are decoded once per variant anyway.
begin
  require "vips"
  Vips.cache_set_max(0)
rescue LoadError
  # libvips is not installed (some local setups): image variants are off there.
end
