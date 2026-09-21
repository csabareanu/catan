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
        Schema::create('game_seats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('seat_number');
            $table->string('controller_type');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label');
            $table->timestamps();

            $table->unique(['game_id', 'seat_number']);
            $table->index(['game_id', 'controller_type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('game_seats');
    }
};
