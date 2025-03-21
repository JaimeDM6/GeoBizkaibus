<?php
header("Access-Control-Allow-Origin: *"); 
header("Content-Type: application/xml");

$url = "https://ctb-siri.s3.eu-south-2.amazonaws.com/bizkaibus-vehicle-positions.xml";
echo file_get_contents($url);
