FROM php:8.3-cli-bookworm

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		$PHPIZE_DEPS \
		ca-certificates \
		curl \
		git \
		libpq-dev \
		procps \
		unzip \
	&& docker-php-ext-install pdo_pgsql \
	&& pecl install redis \
	&& docker-php-ext-enable redis \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./

RUN composer install \
	--no-interaction \
	--no-scripts \
	--prefer-dist \
	--optimize-autoloader

COPY . ./

RUN mkdir -p \
		storage/framework/cache \
		storage/framework/data \
		storage/framework/sessions \
		storage/framework/testing \
		storage/framework/views \
		storage/logs \
		bootstrap/cache \
	&& composer dump-autoload --no-interaction --optimize \
	&& chown -R www-data:www-data storage bootstrap/cache

USER www-data

EXPOSE 8000
