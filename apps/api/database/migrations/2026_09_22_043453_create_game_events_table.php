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
        Schema::create('game_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('command_id')->nullable()->constrained('game_commands')->nullOnDelete();
            $table->unsignedBigInteger('sequence');
            $table->string('event_type');
            $table->json('payload');
            $table->string('visibility');
            $table->unsignedTinyInteger('visible_to_seat_number')->nullable();
            $table->timestamp('occurred_at')->useCurrent();

            $table->unique(['game_id', 'sequence']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('game_events');
    }
};
