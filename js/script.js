document.addEventListener("DOMContentLoaded", function () {
    const map = L.map('map', {
        center: [43.336, -2.997],
        minZoom: 10,
        maxZoom: 18,
        zoom: 12,
        zoomControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const busIcon = L.icon({
        iconUrl: 'img/Autobus.png',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });

    let markersLayer = L.layerGroup().addTo(map);
    let busesLayer = L.layerGroup().addTo(map);
    let busData = [];
    let currentBusMarker = null;

    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close-btn');
    const modalInfo = document.getElementById('modal-info');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    function mostrarModal(info) {
        modalInfo.innerHTML = info;
        modal.classList.add('show');
    }

    function cargarParadas() {
        fetch('xml/stops.xml')
            .then(response => response.text())
            .then(str => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(str, "text/xml");

                const stopPlaces = xmlDoc.getElementsByTagNameNS("http://www.netex.org.uk/netex", "StopPlace");

                Array.from(stopPlaces).forEach(stopPlace => {
                    const name = stopPlace.getElementsByTagNameNS("http://www.netex.org.uk/netex", "Name")[0].textContent;
                    const lat = parseFloat(stopPlace.getElementsByTagNameNS("http://www.netex.org.uk/netex", "Latitude")[0].textContent);
                    const lon = parseFloat(stopPlace.getElementsByTagNameNS("http://www.netex.org.uk/netex", "Longitude")[0].textContent);

                    const nameWithoutId = name.replace(/\s*\([^\)]*\)\s*$/, '');

                    const formattedName = nameWithoutId
                        .split(/([^\wáéíóúüñA-ÿ])/)
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join('');

                    const customIcon = L.icon({
                        iconUrl: 'img/Parada.png',
                        iconSize: [10, 10],
                        iconAnchor: [8, 16],
                        popupAnchor: [0, -16]
                    });

                    const marker = L.marker([lat, lon], { icon: customIcon }).addTo(markersLayer);

                    marker.on('click', () => {
                        const info = `<b>Parada:</b> ${formattedName}<br><b>Longitud:</b> ${lon}<br><b>Latitud:</b> ${lat}`;
                        mostrarModal(info);
                    });
                });
            })
            .catch(error => console.error("Error al cargar las paradas:", error));
    }

    cargarParadas();

    function cargarAutobuses() {
        fetch('https://cors-anywhere.herokuapp.com/https://ctb-siri.s3.eu-south-2.amazonaws.com/bizkaibus-vehicle-positions.xml')
            .then(response => response.text())
            .then(str => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(str, "text/xml");

                const namespace = "http://www.siri.org.uk/siri";
                const vehicleActivities = xmlDoc.getElementsByTagNameNS(namespace, "VehicleActivity");

                busesLayer.clearLayers();

                if (vehicleActivities.length > 0) {
                    const lastUpdateTime = vehicleActivities[0].getElementsByTagNameNS(namespace, "RecordedAtTime")[0].textContent;
                    const formattedDate = new Date(lastUpdateTime).toLocaleString("es-ES", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                    });

                    document.getElementById("last-update").innerHTML = `<b>Última actualización:</b> ${formattedDate}`;
                }

                busData = [];

                Array.from(vehicleActivities).forEach(activity => {
                    const lat = activity.getElementsByTagNameNS(namespace, "Latitude")[0].textContent;
                    const lon = activity.getElementsByTagNameNS(namespace, "Longitude")[0].textContent;
                    const vehicleRef = activity.getElementsByTagNameNS(namespace, "VehicleRef")[0].textContent;
                    const journeyRef = activity.getElementsByTagNameNS(namespace, "VehicleJourneyRef")[0].textContent;
                    const stopPointRef = activity.getElementsByTagNameNS(namespace, "MonitoredCall")[0].getElementsByTagNameNS(namespace, "StopPointRef")[0].textContent;

                    const lineMatch = journeyRef.match(/trp_(A\d+)_/);
                    const line = lineMatch ? lineMatch[1] : "Desconocida";

                    const defaultIcon = L.icon({
                        iconUrl: 'img/Autobus.png',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15],
                        popupAnchor: [0, -15]
                    });

                    const selectedIcon = L.icon({
                        iconUrl: 'img/Autobus-seleccionado.png',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15],
                        popupAnchor: [0, -15]
                    });

                    const marker = L.marker([lat, lon], { icon: busIcon }).addTo(busesLayer);

                    marker.on('click', () => {
                        if (currentBusMarker) {
                            currentBusMarker.setIcon(defaultIcon);
                        }

                        marker.setIcon(selectedIcon);
                        currentBusMarker = marker;

                        obtenerInfoBus(vehicleRef, (busInfo) => {
                            obtenerParadasPorRuta(journeyRef, (paradas) => {
                                let paradasInfo = "<b>Paradas:</b><br><ul>";
                                paradas.forEach(parada => {
                                    if (parada.id === stopPointRef) {
                                        paradasInfo += `<li><b>${parada.name} - ${parada.arrivalTime}</b></li>`;
                                    } else {
                                        paradasInfo += `<li>${parada.name} - ${parada.arrivalTime}</li>`;
                                    }
                                });
                                paradasInfo += "</ul>";

                                const info = `
                                <div class="bus-container">
                                    <img src="${busInfo.imagen}" alt="Imagen del Autobús" height="55">
                                </div>
                                <br>
                                <div class="bus-info">
                                    <div class="info-row">
                                        <div class="info-box">
                                            <span class="info-box-label">Numeración</span><br>
                                            <span class="info-box-desc">${vehicleRef}</span>
                                        </div>
                                        <div class="info-box">
                                            <span class="info-box-label">Línea</span><br>
                                            <span class="info-box-desc">${line}</span>
                                        </div>
                                        <div class="info-box">
                                            <span class="info-box-label">Marca</span><br>
                                            <img src="${busInfo.marcaImg}" alt="Marca" width="80"><br>
                                        </div>
                                    </div>
                            
                                    <div class="info-row">
                                        <div class="info-box">
                                            <span class="info-box-label">Modelo</span><br>
                                            <span class="info-box-desc">${busInfo.modelo}</span>
                                        </div>
                                        <div class="info-box">
                                            <span class="info-box-label">Longitud</span><br>
                                            <span class="info-box-desc">${busInfo.longitud}</span>
                                        </div>
                                    </div>
                            
                                    <div class="info-row">
                                        <div class="info-box">
                                            <span class="info-box-label">Matrícula</span><br>
                                            <span class="info-box-desc">${busInfo.matricula}</span>
                                        </div>
                                        <div class="info-box">
                                            <span class="info-box-label">Concesión</span><br>
                                            <img src="${busInfo.concesionImg}" alt="Concesión" width="120"><br>
                                        </div>
                                    </div>
                                </div>
                                <br>
                                <div class="stops-info">
                                    ${paradasInfo}
                                </div>
                            `;

                                mostrarModal(info);
                            });
                        });
                    });

                    busData.push({ lat, lon, vehicleRef, line, marker, journeyRef, stopPointRef });
                });

                busesLayer.eachLayer(function (layer) {
                    if (layer._latlng && layer._icon) {
                        layer.setZIndexOffset(1000);
                    }
                });
            })
            .catch(error => console.error("Error al cargar los datos:", error));
    }

    function obtenerInfoBus(vehicleRef, callback) {
        fetch('xml/buses.xml')
            .then(response => response.text())
            .then(str => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(str, "text/xml");

                const vehiculos = xmlDoc.getElementsByTagName("Vehiculo");
                let busInfo = {
                    marca: "Desconocida",
                    modelo: "Desconocido",
                    longitud: "Desconocida",
                    matricula: "Desconocida",
                    concesion: "Desconocida",
                    descripcion: "Desconocida",
                    imagen: "img/Autobus 12m.png",
                    marcaImg: "img/NoData.png",
                    concesionImg: "img/NoData.png"
                };

                Array.from(vehiculos).forEach(vehiculo => {
                    const numero = vehiculo.getElementsByTagName("Numero")[0].textContent;
                    if (numero === vehicleRef) {
                        const longitud = vehiculo.getElementsByTagName("Longitud")[0].textContent;
                        let imagenBus = "img/Autobus 12m.png";

                        if (longitud.includes("10")) imagenBus = "img/Autobus 10m.png";
                        else if (longitud.includes("12")) imagenBus = "img/Autobus 12m.png";
                        else if (longitud.includes("13")) imagenBus = "img/Autobus 13m.png";
                        else if (longitud.includes("15")) imagenBus = "img/Autobus 15m.png";
                        else if (longitud.includes("18")) imagenBus = "img/Autobus 18m.png";

                        busInfo = {
                            marca: vehiculo.getElementsByTagName("Marca")[0].textContent,
                            modelo: vehiculo.getElementsByTagName("Modelo")[0].textContent,
                            longitud: longitud,
                            matricula: vehiculo.getElementsByTagName("Matricula")[0].textContent,
                            concesion: vehiculo.getElementsByTagName("Concesion")[0].textContent,
                            descripcion: vehiculo.getElementsByTagName("DescripcionConcesion")[0].textContent,
                            imagen: imagenBus,
                            marcaImg: `img/Marcas/${vehiculo.getElementsByTagName("Marca")[0].textContent}.png`,
                            concesionImg: `img/${vehiculo.getElementsByTagName("Concesion")[0].textContent}.png`
                        };
                    }
                });

                callback(busInfo);
            })
            .catch(error => console.error("Error al cargar los datos de buses.xml:", error));
    }

    function obtenerParadasPorRuta(serviceJourneyId, callback) {
        const lineNumber = serviceJourneyId.split('_')[1].replace('A', '').replace(/^0+/, '');

        fetch(`xml/line-${lineNumber}.xml`)
            .then(response => response.text())
            .then(str => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(str, "text/xml");
                const serviceJourney = xmlDoc.querySelector(`ServiceJourney[id="${serviceJourneyId}"]`);

                if (!serviceJourney) {
                    console.error('Servicio no encontrado');
                    return;
                }

                const journeyPatternRef = serviceJourney.querySelector('JourneyPatternRef');
                const passingTimes = serviceJourney.getElementsByTagName('TimetabledPassingTime');

                const stopIds = journeyPatternRef.getAttribute('ref')
                    .split(':')[1]
                    .split('-')
                    .slice(1);

                fetch('xml/stops.xml')
                    .then(response => response.text())
                    .then(stopsStr => {
                        const stopsDoc = new DOMParser().parseFromString(stopsStr, 'text/xml');
                        const paradas = [];

                        let stopPointNumber = 1;

                        stopIds.forEach(stopId => {
                            const stopElement = stopsDoc.querySelector(`StopPlace[id="${stopId}"]`);
                            if (stopElement) {
                                const stopName = stopElement.querySelector('Name').textContent;
                                const latitude = stopElement.querySelector('Location Latitude').textContent;
                                const longitude = stopElement.querySelector('Location Longitude').textContent;

                                const nameWithoutId = stopName.replace(/\s*\([^\)]*\)\s*$/, '');
                                const formattedName = nameWithoutId
                                    .split(/([^\wáéíóúüñA-ÿ])/)
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                    .join('');

                                const passingTime = Array.from(passingTimes).find(pt => {
                                    const ref = pt.querySelector('StopPointInJourneyPatternRef').getAttribute('ref');
                                    return ref.endsWith('-' + stopPointNumber);
                                });

                                let arrivalTime = '';
                                if (passingTime) {
                                    arrivalTime = passingTime.querySelector('ArrivalTime').textContent;
                                    arrivalTime = arrivalTime.slice(0, 5);
                                }

                                paradas.push({
                                    id: stopId,
                                    name: formattedName,
                                    latitude,
                                    longitude,
                                    arrivalTime
                                });

                                stopPointNumber++;
                            }
                        });

                        callback(paradas);
                    })
                    .catch(error => console.error('Error al cargar las paradas:', error));
            })
            .catch(error => console.error('Error al cargar la línea:', error));
    }

    cargarAutobuses();
    setInterval(cargarAutobuses, 10000);

    document.getElementById("search-results").addEventListener("wheel", function (event) {
        event.stopPropagation();
    });

    document.getElementById("search").addEventListener("mousedown", function (event) {
        map.dragging.disable();
    });

    document.getElementById("search").addEventListener("mouseup", function (event) {
        map.dragging.enable();
    });

    document.getElementById("modal").addEventListener("mousedown", function (event) {
        map.dragging.disable();
    });

    document.getElementById("modal").addEventListener("mouseup", function (event) {
        map.dragging.enable();
    });

    const rutasNoPrincipalesVuelta = L.tileLayer.wms("https://geo.bizkaia.eus/arcgisserverinspire/services/Garraioa_Transporte/Bizkaibus/MapServer/WMSServer?", {
        layers: '1',
        format: 'image/png',
        transparent: true,
        attribution: "Bizkaibus - Diputación Foral de Bizkaia"
    });

    const rutasNoPrincipalesIda = L.tileLayer.wms("https://geo.bizkaia.eus/arcgisserverinspire/services/Garraioa_Transporte/Bizkaibus/MapServer/WMSServer?", {
        layers: '2',
        format: 'image/png',
        transparent: true,
        attribution: "Bizkaibus - Diputación Foral de Bizkaia"
    });

    const rutasBizkaibusVuelta = L.tileLayer.wms("https://geo.bizkaia.eus/arcgisserverinspire/services/Garraioa_Transporte/Bizkaibus/MapServer/WMSServer?", {
        layers: '3',
        format: 'image/png',
        transparent: true,
        attribution: "Bizkaibus - Diputación Foral de Bizkaia"
    });

    const rutasBizkaibusIda = L.tileLayer.wms("https://geo.bizkaia.eus/arcgisserverinspire/services/Garraioa_Transporte/Bizkaibus/MapServer/WMSServer?", {
        layers: '4',
        format: 'image/png',
        transparent: true,
        attribution: "Bizkaibus - Diputación Foral de Bizkaia"
    });

    L.control.layers({}, {
        "Autobuses": busesLayer,
        "Paradas": markersLayer,
        "Rutas Bizkaibus Sentido Ida": rutasBizkaibusIda,
        "Rutas Bizkaibus Sentido Vuelta": rutasBizkaibusVuelta,
        "No Principales Sentido Ida": rutasNoPrincipalesIda,
        "No Principales Sentido Vuelta": rutasNoPrincipalesVuelta
    }).addTo(map);

    rutasBizkaibusIda.addTo(map);

    const searchInput = document.getElementById("search");
    const searchResults = document.getElementById("search-results");

    searchInput.addEventListener("input", function () {
        const query = searchInput.value.toLowerCase();
        searchResults.innerHTML = "";

        if (query.length === 0) {
            searchResults.style.display = "none";
            return;
        }

        const filteredBuses = busData.filter(bus =>
            bus.vehicleRef.includes(query) || bus.line.includes(query)
        );

        if (filteredBuses.length === 0) {
            searchResults.style.display = "none";
            return;
        }

        filteredBuses.forEach(bus => {
            const div = document.createElement("div");
            div.classList.add("search-result");
            div.textContent = `Vehículo: ${bus.vehicleRef} | Línea: ${bus.line}`;
            div.addEventListener("click", function () {
                map.setView([bus.lat, bus.lon], 20);
                searchResults.style.display = "none";
                searchInput.value = "";

                const selectedIcon = L.icon({
                    iconUrl: 'img/Autobus-seleccionado.png',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -15]
                });

                bus.marker.setIcon(selectedIcon);
                currentBusMarker = bus.marker;

                obtenerInfoBus(bus.vehicleRef, (busInfo) => {
                    obtenerParadasPorRuta(bus.journeyRef, (paradas) => {
                        let paradasInfo = "<b>Paradas:</b><br><ul>";
                        paradas.forEach(parada => {
                            if (parada.id === bus.stopPointRef) {
                                paradasInfo += `<li><b>${parada.name} - ${parada.arrivalTime}</b></li>`;
                            } else {
                                paradasInfo += `<li>${parada.name} - ${parada.arrivalTime}</li>`;
                            }
                        });
                        paradasInfo += "</ul>";

                        const info = `
                        <div class="bus-container">
                            <img src="${busInfo.imagen}" alt="Imagen del Autobús" height="55">
                        </div>
                        <br>
                        <div class="bus-info">
                            <div class="info-box">
                                <span class="info-box-label">Numeración</span><br>
                                <span class="info-box-desc">${bus.vehicleRef}</span>
                            </div>
                            <div class="info-box">
                                <span class="info-box-label">Línea</span><br>
                                <span class="info-box-desc">${bus.line}</span>
                            </div>
                            <div class="info-box">
                                <span class="info-box-label">Marca</span><br>
                                <img src="${busInfo.marcaImg}" alt="Marca" width="80"><br>
                            </div>
                            <div class="info-box">
                                <span class="info-box-label">Modelo</span><br>
                                <span class="info-box-desc">${busInfo.modelo}</span>
                            </div>
                            <div class="info-box">
                                <span class="info-box-label">Longitud</span><br>
                                <span class="info-box-desc">${busInfo.longitud}</span>
                            </div>
                            <div class="info-box">
                                <span class="info-box-label">Matrícula</span><br>
                                <span class="info-box-desc">${busInfo.matricula}</span>
                            </div>
                            <div class="info-box">
                                <span class="info-box-label">Concesión</span><br>
                                <img src="${busInfo.concesionImg}" alt="Concesión" height="50"><br>
                            </div>
                        </div>
                        <br>
                        <div class="stops-info">
                            ${paradasInfo}
                        </div>
                    `;

                        mostrarModal(info);
                    });
                });
            });
            searchResults.appendChild(div);
        });

        searchResults.style.display = "block";
    });

    document.addEventListener("click", function (event) {
        if (!searchInput.contains(event.target) && !searchResults.contains(event.target)) {
            searchResults.style.display = "none";
        }
    });

    var attribution = document.querySelector(".leaflet-control-attribution");

    if (attribution) {
      var oldAttribution = attribution.querySelector("a");
  
      if (oldAttribution) {
        var newAttribution = document.createElement("span");
        newAttribution.classList.add("leaflet-custom-attribution");
  
        var inlineSvg = `
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag">
            <rect width="12" height="2" fill="#AA151B"/>
            <rect y="2" width="12" height="4" fill="#F1BF00"/>
            <rect y="6" width="12" height="2" fill="#AA151B"/>
          </svg>`;
  
        newAttribution.innerHTML = inlineSvg + `<span class="attribution-text"> Jaime DM</span>`;
  
        oldAttribution.replaceWith(newAttribution);
      }
    }
});
