<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, PUT, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$dbPath = dirname(__DIR__) . "/data/monsalon.db";

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    if (!file_exists($dbPath)) {
        http_response_code(204);
        exit;
    }
    header("Content-Type: application/octet-stream");
    header("X-Db-Updated: " . gmdate("c", filemtime($dbPath)));
    readfile($dbPath);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "PUT") {
    $data = file_get_contents("php://input");
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($dbPath, $data);
    header("Content-Type: application/json");
    echo json_encode([
        "ok" => true,
        "path" => "data/monsalon.db",
        "updated_at" => gmdate("c", filemtime($dbPath))
    ]);
    exit;
}

http_response_code(405);
