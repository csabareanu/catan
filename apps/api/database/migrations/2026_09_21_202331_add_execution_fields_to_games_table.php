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
        Schema::table('games', function (Blueprint $table): void {
            $table->string('state_schema_version')->nullable();
            $table->json('current_state')->nullable();
            $table->json('result')->nullable();
            $table->unsignedBigInteger('last_command_sequence')->default(0);
            $table->unsignedBigInteger('last_event_sequence')->default(0);
            $table->unsignedInteger('run_attempts')->default(0);
            $table->string('failure_code')->nullable();
            $table->text('failure_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->index(['lifecycle_status', 'updated_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('games', function (Blueprint $table): void {
            $table->dropIndex(['lifecycle_status', 'updated_at']);
            $table->dropColumn([
                'state_schema_version',
                'current_state',
                'result',
                'last_command_sequence',
                'last_event_sequence',
                'run_attempts',
                'failure_code',
                'failure_message',
                'started_at',
                'completed_at',
            ]);
        });
    }
};
