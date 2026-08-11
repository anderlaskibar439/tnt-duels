FROM php:8.2-apache

RUN docker-php-ext-install pdo pdo_mysql

COPY api/ /var/www/html/api/
RUN cp /var/www/html/api/config.example.php /var/www/html/api/config.php

# Render asigna el puerto público via la variable de entorno PORT en tiempo
# de ejecución (no en build), así que Apache tiene que escuchar en ese
# puerto al arrancar el contenedor, no en el 80 por defecto.
RUN echo '#!/bin/sh\n\
set -e\n\
sed -i "s/80/${PORT:-8080}/g" /etc/apache2/ports.conf /etc/apache2/sites-enabled/000-default.conf\n\
exec apache2-foreground\n' > /usr/local/bin/start-apache.sh \
    && chmod +x /usr/local/bin/start-apache.sh

EXPOSE 8080
CMD ["/usr/local/bin/start-apache.sh"]
