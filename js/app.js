var firebaseConfig = {
    apiKey: "AIzaSyBWrFxW_77FLMcrt8WoixzkEPy6ClSu6f0",
    authDomain: "where2p-388bb.firebaseapp.com",
    databaseURL: "https://where2p-388bb.firebaseio.com",
    projectId: "where2p-388bb",
    storageBucket: "where2p-388bb.appspot.com",
    messagingSenderId: "896023113193",
    appId: "1:896023113193:web:5c255b734c84f410"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

var database = firebase.database();

var ReviewID;

$('select').formSelect();

// Get the modal
var modal = document.getElementById("myModal");

// Get the <span> element that closes the modal
var span = document.getElementsByClassName("close")[0];

span.onclick = function() {
    modal.style.display = "none";
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
    if (event.target == modal2) {
        modal2.style.display = "none";
    }
}

// Get the modal
var modal2 = document.getElementById("myModal2");

// Get the <span> element that closes the modal
var span2 = document.getElementsByClassName("close2")[0];

// When the user clicks on <span> (x), close the modal
span2.onclick = function() {
    modal2.style.display = "none";
}

$(document).on('click', "#submit-review", function() {
    event.preventDefault();
    var userName = $('#userName').val().trim();
    var userRating = $('#userRating').val();
    var userReview = $('#userReview').val().trim();

    if (userName.length > 0 && userReview.length > 0) {
        database.ref(ReviewID).push({
            name: userName,
            rating: userRating,
            review: userReview
        })
    }
    modal.style.display = "none";
    $('#userName').val("");
    $('#userReview').val("");
});

$(document).on('click', ".see-reviews", function() {
    event.preventDefault();
    ReviewID = $(this).attr('data-id');
    modal2.style.display = "block";

    $("#reviews-list").empty();

    var businessRef = database.ref(ReviewID);
    businessRef.on('value', function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            var childData = childSnapshot.val();
            var newDiv = $("<div>");
            newDiv.append($("<p>").addClass("bigger").text("Name: " + childData.name), $("<p>").addClass("bigger").text("Rating: " + childData.rating), $("<p>").addClass('bigger').text("Review: " + childData.review), "<br>");
            $("#reviews-list").append(newDiv);
        });
    });
});

$(document).on('click', ".add-review", function() {
    event.preventDefault();
    modal.style.display = "block";
    ReviewID = $(this).attr('data-id');
    $(this).addClass('hide');
});


var map;
var pos = {};

function initMap() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            }

            map = new google.maps.Map(document.getElementById("map"), {
                center: {
                    lat: pos.lat,
                    lng: pos.lng
                },
                zoom: 15
            });

            var marker = new google.maps.Marker({
                position: pos,
                map: map,
                title: "You are here.",
                animation: google.maps.Animation.DROP,
                icon: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png"
            })
            marker.setMap(map);

            var apiKey = "e9d3c600773e0277e03e42289aeaf483";

            $.ajax({
                url: 'https://cryptic-castle-96421.herokuapp.com/api.openweathermap.org/data/2.5/weather?lat=' + pos.lat + '&lon=' + pos.lng + '&units=imperial&appid=' + apiKey,
                method: "GET"

            }).then(function(response) {

                var weatherCityId = response.id;

                $('#openweathermap-widget-15').empty();
                window.myWidgetParam ? window.myWidgetParam : window.myWidgetParam = [];
                window.myWidgetParam.push({ id: 15, cityid: weatherCityId, appid: '945c3adf4a846dc18d8b8ed754fe7142', units: 'imperial', containerid: 'openweathermap-widget-15', });
                (function() {
                    var script = document.createElement('script');
                    script.async = true;
                    script.charset = "utf-8";
                    script.src = "//openweathermap.org/themes/openweathermap/assets/vendor/owm/js/weather-widget-generator.js";
                    var s = document.getElementsByTagName('script')[0];
                    s.parentNode.insertBefore(script, s);
                })();
            });

            var queryURL = 'https://cryptic-castle-96421.herokuapp.com/https://api.yelp.com/v3/businesses/search?latitude=' + pos.lat + '&longitude=' + pos.lng + '&term=public+restroom&reviews&radius=10000&limit=15&attributes=gender_neutral_restrooms';
            $.ajax({
                url: queryURL,
                method: "GET",
                headers: {
                    authorization: "Bearer 4Rm7FqyoBh0DGVD6bV936T1y38wYSXyOiQBtQsIza6j_MZVWcPuLtT7x_06Ej7j5TN4ZFgsOAxlj_FHlQrjgyfYbXsGuYjQeamj84ii533Ii5sTH4wKUUjhqNqf6XHYx"
                }
            }).then(function(response) {
                for (var i = 0; i < response.businesses.length; i++) {
                    var yelpPos = {
                        lat: response.businesses[i].coordinates.latitude,
                        lng: response.businesses[i].coordinates.longitude
                    };
                    var marker = new google.maps.Marker({
                        position: yelpPos,
                        map: map,
                        title: response.businesses[i].name,
                        animation: google.maps.Animation.DROP,
                        icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                    });
                    marker.setMap(map);
                    var newDiv = $("<div>").addClass('row results-div card-panel lighten-5');
                    var addReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                    var id = response.businesses[i].id;
                    var rating = $("<span>").text("| Rating: " + response.businesses[i].rating);
                    var imageDiv = $("<img>").attr('src', response.businesses[i].image_url);
                    imageDiv.addClass("placeImg");
                    var isOpen;
                    var name = $("<h6>").text(response.businesses[i].name).addClass("business");

                    if (response.businesses[i].is_closed === false) {
                        isOpen = $("<p>").text("Open Now");
                        isOpen.addClass("open");
                    } else {
                        isOpen = $("<p>").text("Closed Now");
                        isOpen.addClass("closed");
                    }

                    var seeReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                    seeReview.attr("data-id", id);
                    seeReview.css({ float: "left" });
                    seeReview.addClass('see-reviews');
                    seeReview.text("See Reviews");

                    addReview.attr("data-id", id);
                    addReview.css({ float: "left" });
                    addReview.addClass('add-review');
                    addReview.text("Add Review");

                    newDiv.append(name, imageDiv, isOpen, rating, seeReview, addReview);

                    $("#results").append(newDiv);
                }
            })
            $.ajax({
                url: "https://cryptic-castle-96421.herokuapp.com/https://maps.googleapis.com/maps/api/place/textsearch/json?query=Public+Resroom&location=" + pos.lat + "," + pos.lng + "&key=AIzaSyAz23lQswC8r0KGNmRE09W2dzLYVeqWoT0",
                method: "GET"
            }).then(function(response) {

                for (var i = 0; i < response.results.length; i++) {

                    var locationPos = {
                        lat: response.results[i].geometry.location.lat,
                        lng: response.results[i].geometry.location.lng
                    };
                    var marker = new google.maps.Marker({
                        position: locationPos,
                        map: map,
                        title: response.results[i].formatted_address,
                        animation: google.maps.Animation.DROP,
                    });
                    marker.setMap(map);

                    if (response.results[i].photos === undefined) {

                    } else {
                        photoRef = response.results[i].photos[0]["photo_reference"];

                        var photoURL = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=" + photoRef + "&key=AIzaSyAz23lQswC8r0KGNmRE09W2dzLYVeqWoT0"

                        var newDiv = $("<div>");
                        newDiv.addClass('row results-div card-panel lighten-5');
                        var name = $("<p>").text(response.results[i].name);
                        var rating = $("<p>").text("Rating: " + response.results[i].rating);
                        name.addClass("business");
                        var imageDiv = $("<img>").addClass("placeImg");
                        imageDiv.attr('src', photoURL);
                        var id = response.results[i].place_id;

                        var seeReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                        seeReview.attr("data-id", id);
                        seeReview.css({ float: "left" });
                        seeReview.addClass('see-reviews');
                        seeReview.text("See Reviews");

                        var addReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                        addReview.attr("data-id", id);
                        addReview.css({ float: "left" });
                        addReview.addClass('add-review');
                        addReview.text("Add Review");

                        newDiv.append(name, imageDiv, rating, seeReview, addReview);

                        $("#results").append(newDiv);
                    }
                }
            });
        })
    }
}

function initMapOnSubmit(address, city, state) {

    var locationPos = {};

    $.ajax({
        url: "https://maps.googleapis.com/maps/api/geocode/json?address=" + address + ",+" + city + ",+" + state + "&key=AIzaSyAz23lQswC8r0KGNmRE09W2dzLYVeqWoT0",
        method: "GET"
    }).then(function(response) {
        locationPos = {
            lat: response.results[0].geometry.location.lat,
            lng: response.results[0].geometry.location.lng
        }
        map = new google.maps.Map(document.getElementById("map"), {
            center: {
                lat: locationPos.lat,
                lng: locationPos.lng
            },
            zoom: 15
        });

        var marker = new google.maps.Marker({
            position: locationPos,
            map: map,
            title: "You are here.",
            animation: google.maps.Animation.DROP,
            icon: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png"
        })
        marker.setMap(map);

        var apiKey = "e9d3c600773e0277e03e42289aeaf483";
        $.ajax({
            url: 'https://cryptic-castle-96421.herokuapp.com/api.openweathermap.org/data/2.5/weather?lat=' + locationPos.lat + '&lon=' + locationPos.lng + '&units=imperial&appid=' + apiKey,
            method: "GET"

        }).then(function(response) {

            var weatherCityId = response.id;

            $('#openweathermap-widget-15').empty();
            window.myWidgetParam ? window.myWidgetParam : window.myWidgetParam = [];
            window.myWidgetParam.push({ id: 15, cityid: weatherCityId, appid: '945c3adf4a846dc18d8b8ed754fe7142', units: 'imperial', containerid: 'openweathermap-widget-15', });
            (function() {
                var script = document.createElement('script');
                script.async = true;
                script.charset = "utf-8";
                script.src = "//openweathermap.org/themes/openweathermap/assets/vendor/owm/js/weather-widget-generator.js";
                var s = document.getElementsByTagName('script')[0];
                s.parentNode.insertBefore(script, s);
            })();

        });

        var queryURL = 'https://cryptic-castle-96421.herokuapp.com/https://api.yelp.com/v3/businesses/search?term=public+restroom&location=' + address + ' ' + city + ' ' + state + '&radius=5000&limit=15&attributes=gender_neutral_restrooms';
        $.ajax({
            url: queryURL,
            method: "GET",
            headers: {
                authorization: "Bearer 4Rm7FqyoBh0DGVD6bV936T1y38wYSXyOiQBtQsIza6j_MZVWcPuLtT7x_06Ej7j5TN4ZFgsOAxlj_FHlQrjgyfYbXsGuYjQeamj84ii533Ii5sTH4wKUUjhqNqf6XHYx"
            }
        }).then(function(response) {
            for (var i = 0; i < response.businesses.length; i++) {
                var yelpPos = {
                    lat: response.businesses[i].coordinates.latitude,
                    lng: response.businesses[i].coordinates.longitude
                };
                var marker = new google.maps.Marker({
                    position: yelpPos,
                    map: map,
                    title: response.businesses[i].alias,
                    animation: google.maps.Animation.DROP,
                    icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                });
                marker.setMap(map);
                var newDiv = $("<div>");
                newDiv.addClass('row results-div card-panel lighten-5')
                var addReview = $("<button>");
                addReview.addClass("btn-link waves-effect waves-light btn-link reviews");
                var rating = $("<p>").text("Rating: " + response.businesses[i].rating);
                var imageDiv = $("<img>").addClass("placeImg");
                imageDiv.attr('src', response.businesses[i].image_url);
                var name = $("<h6>").text(response.businesses[i].name);
                name.addClass("business");
                var id = response.businesses[i].id;
                var isOpen;
                if (response.businesses[i].is_closed === false) {
                    isOpen = $("<p>").text("Open Now");
                    isOpen.addClass("open");
                } else {
                    isOpen = $("<p>").text("Closed Now");
                    isOpen.addClass("closed");
                }
                var seeReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                seeReview.attr("data-id", id);
                seeReview.css({ float: "left" });
                seeReview.addClass('see-reviews');
                seeReview.text("See Reviews");

                addReview.attr("data-id", id);
                addReview.css({ float: "left" });
                addReview.addClass('add-review');
                addReview.text("Add Review");
                newDiv.append(name, imageDiv, isOpen, rating, seeReview, addReview);

                $("#results").append(newDiv);
            }
        });

        $.ajax({
            url: "https://cryptic-castle-96421.herokuapp.com/https://maps.googleapis.com/maps/api/place/textsearch/json?query=Public+Restroom&location=" + locationPos.lat + "," + locationPos.lng + "&radius=5000&key=AIzaSyAz23lQswC8r0KGNmRE09W2dzLYVeqWoT0",
            method: "GET"
        }).then(function(response) {
            for (var i = 0; i < response.results.length; i++) {

                var locationPos = {
                    lat: response.results[i].geometry.location.lat,
                    lng: response.results[i].geometry.location.lng
                };
                var marker = new google.maps.Marker({
                    position: locationPos,
                    map: map,
                    title: response.results[i].formatted_address,
                    animation: google.maps.Animation.DROP,
                });
                marker.setMap(map);

                if (response.results[i].photos === undefined) {

                } else {
                    photoRef = response.results[i].photos[0]["photo_reference"];
                    var photoURL = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=" + photoRef + "&key=AIzaSyAz23lQswC8r0KGNmRE09W2dzLYVeqWoT0";

                    var newDiv = $("<div>");
                    newDiv.addClass('row results-div card-panel lighten-5');
                    var imageDiv = $("<img>").addClass("placeImg");
                    imageDiv.attr('src', photoURL);
                    var name = $("<p>").text(response.results[i].name);
                    var rating = $("<p>").text("Rating: " + response.results[i].rating);
                    rating.addClass("rating");
                    name.addClass("business");

                    var id = response.results[i].place_id;

                    var seeReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                    seeReview.attr("data-id", id);
                    seeReview.css({ float: "left" });
                    seeReview.addClass('see-reviews');
                    seeReview.text("See Reviews");

                    var addReview = $("<button>").addClass("btn-link waves-effect waves-light btn-link reviews");
                    addReview.attr("data-id", id);
                    addReview.css({ float: "left" });
                    addReview.addClass('add-review');
                    addReview.text("Add Review");

                    newDiv.append(name, imageDiv, rating, seeReview, addReview);

                    $("#results").append(newDiv);
                }
            }
        });
    });
}

$("#submit").on("click", function() {
    event.preventDefault();
    $("#results").empty();
    $("#results2").empty();
    var address = $("#address").val().trim();
    var city = $("#city").val().trim();
    var state = $("#state").val();

    initMapOnSubmit(address, city, state);

    $("#address").val("");
    $("#city").val("");
    $("#state").val("");
})