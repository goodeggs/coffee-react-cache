var fs     = require('fs');
var path   = require('path');
var mkpath = require('mkpath');
// We don't want to include our own version of CoffeeScript since we don't know
// what version the parent relies on
var coffee;
try {
  coffee = require('coffee-react');
  coffee.register();
} catch (e) {
  // No coffee-script installed in the project; warn them and stop
  process.stderr.write("coffee-react-cache: No coffee-react package found.\n");
  return;
}

// Directory to store compiled source
var cacheDir = process.env['COFFEE_CACHE_DIR'] || '.coffee';

// Root directory of project - use __dirname by default
var rootDir = process.env['COFFEE_ROOT_DIR'] || '.';

// Only log once if we can't write the cache directory
var logCouldNotWriteCache = function() {
  process.stderr.write(
    "coffee-react-cache: Could not write cache at " + cacheDir + ".\n"
  );
  logCouldNotWriteCache = function(){};
}

// Compile a file as you would with require and return the contents
function cacheFile(filename) {
  // First, convert the filename to something more digestible and use our cache
  // folder
  var cachePath = path.join(cacheDir, path.relative(rootDir, filename)).replace(/\.(coffee|cjsx)$/, '.js');
  var mapPath = path.resolve(cachePath.replace(/\.js$/, '.map'));
  var content;

  // Try and stat the files for their last modified time
  try {
    var sourceTime = fs.statSync(filename).mtime;
    var cacheTime = fs.statSync(cachePath).mtime;
    if (cacheTime > sourceTime) {
      // We can return the cached version
      content = fs.readFileSync(cachePath, 'utf8');
    }
  } catch (err) {
    // If the cached file was not created yet, this will fail, and that is okay
  }

  // If we don't have the content, we need to compile ourselves
  if (!content) {
    try {
      // Read from disk and then compile
      var compiled = coffee.compile(fs.readFileSync(filename, 'utf8'), {
        filename: filename,
        sourceMap: true
      });
      content = compiled.js;

      // Since we don't know which version of CoffeeScript we have, make sure
      // we handle the older versions that return just the compiled version.
      if (content == null)
        content = compiled;

      // Try writing to cache
      mkpath.sync(path.dirname(cachePath));
      fs.writeFileSync(cachePath, content, 'utf8');
      if (mapPath)
        fs.writeFileSync(mapPath, compiled.v3SourceMap, 'utf8');
    } catch (err) {
      logCouldNotWriteCache()
    }
  }

  return content;
}

// Set up an extension map for CoffeeScript files -- we are completely overriding
// CoffeeScript's since it only returns the compiled module.
coffee.FILE_EXTENSIONS.forEach(function(extension) {
  var originalExtension = require.extensions[extension]
  require.extensions[extension] = function(module, filename) {
    var content = cacheFile(filename);
    if (content)
      // Successfully retrieved the file from disk or the cache
      return module._compile(content, filename);
    else
      // Something went wrong, so we can use coffee's require
      return originalExtension.apply(this, arguments);
  };
});

// Export settings
module.exports = {
  setCacheDir: function(dir, root){
    if(root) {
      rootDir = root;
    }

    cacheDir = dir;
    return this;
  },
  cacheFile: cacheFile,
};
