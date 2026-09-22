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
        Schema::create('game_commands', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('sequence');
            $table->string('idempotency_key');
            $table->unsignedTinyInteger('acting_seat_number')->nullable();
            $table->string('command_type');
            $table->json('payload');
            $table->timestamp('accepted_at')->useCurrent();

            $table->unique(['game_id', 'sequence']);
            $table->unique(['game_id', 'idempotency_key']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('game_commands');
    }
};
