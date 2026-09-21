<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('mode');
            $table->string('ruleset_key');
            $table->string('ruleset_version');
            $table->string('seed');
            $table->unsignedTinyInteger('seat_count');
            $table->unsignedTinyInteger('human_seat_number')->nullable();
            $table->string('lifecycle_status');
            $table->json('configuration');
            $table->json('board_configuration');
            $table->timestamps();

            $table->index(['owner_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('games');
    }
};
