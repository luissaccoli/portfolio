.PHONY: clean

clean:
	@printf 'Deleting production build: dist/\n'
	@rm -rf dist
	@printf 'Deleting copied public assets and JavaScript: public/assets/ public/js/\n'
	@rm -rf public/assets public/js
	@printf 'Deleting rendered HTML: public/*.html\n'
	@find public -maxdepth 1 -name '*.html' -delete
	@printf 'Deleting macOS metadata: .DS_Store\n'
	@find . -name .DS_Store -not -path './node_modules/*' -not -path './.git/*' -delete
	@printf 'Clean complete.\n'
