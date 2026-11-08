<?php

namespace App\Exceptions;

use Exception;

class TurnCommandRejected extends Exception
{
    public function __construct(public readonly string $engineCode)
    {
        parent::__construct('The turn command is not available at the current game boundary.');
    }
}
